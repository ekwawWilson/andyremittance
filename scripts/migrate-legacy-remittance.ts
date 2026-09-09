/**
 * migrate-legacy-remittance.ts
 *
 * Migrates the old Petros system's remittance data (SQL Server) into this
 * application's PostgreSQL database.
 *
 *   petros_MoneyRec_utbl        64,947 rows — the transaction
 *   petros_MoneyDelivered_utbl  99,622 rows — the payout (effectively 1:1)
 *
 * What the source does NOT carry, and how each gap is handled:
 *
 *   branch          Neither table records one, and it cannot be inferred (both
 *                   paying tellers span the whole date range). Every row is
 *                   assigned to --branch (default ACCRA) and the note says so.
 *   exchange rate   ExchangeRate.date is unique, but 1,178 of 1,187 business
 *                   days carry more than one implied rate. One modal rate per
 *                   day is stored; each transaction keeps its true rate in
 *                   exchangeRateUsed.
 *   transaction code  The old TransCode is just ddMM — 364 distinct values over
 *                   64,947 rows. Fresh codes are generated.
 *   receiving mode  Recovered from MoneyDelivered.ID_Type, which the old system
 *                   overloaded as the payout channel (MTN / VODAFONE /
 *                   AIRTEL-TIGO = mobile money, ID documents = cash).
 *   momo number     Lives at the end of the Recipient string, exactly as in the
 *                   Excel day-sheets, so the same parser handles it.
 *
 * Accounting: this writes NO journal entries and moves NO ledger balances.
 * Migrated rows are historical records only, so the books continue to reflect
 * live activity alone.
 *
 * Idempotent: every transaction's note carries [legacy:<TransAuto>], and rows
 * already present are skipped, so the script can be re-run or resumed safely.
 *
 * Usage:
 *   npx tsx scripts/migrate-legacy-remittance.ts                 # dry run
 *   npx tsx scripts/migrate-legacy-remittance.ts --confirm
 *   npx tsx scripts/migrate-legacy-remittance.ts --confirm --year 2026
 *   npx tsx scripts/migrate-legacy-remittance.ts --confirm --branch KUMASI
 *
 * Source credentials come from the environment — never commit them:
 *   LEGACY_DB_SERVER  LEGACY_DB_NAME  LEGACY_DB_USER  LEGACY_DB_PASS
 */

import sql from 'mssql';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/db/prisma';
import { normaliseMomoNumber, tidyName } from '../lib/services/excel-import.parser';
import { nameKey, splitName } from '../lib/services/excel-import.service';
import { generateShortTransactionCode, generateTransactionCode } from '../lib/utils/transaction-code';

// ─── Options ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const CONFIRM = argv.includes('--confirm');
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const YEAR = arg('--year');
const BRANCH_CODE = (arg('--branch') ?? 'ACCRA').toUpperCase();
const BATCH = 500;

// ─── Source shape ────────────────────────────────────────────────────────────

interface LegacyRow {
  TransAuto: number;
  TransDate: Date;
  Sender: string | null;
  Recipient: string | null;
  CAN_Amount: number;
  Amount: number;
  Delivered: number;
  Returned: number;
  DeliveryDate: Date | null;
  ID_Type: string | null;
  DeliveredBy: string | null;
  ReceivedBy: string | null;
  ReceiptNo: string | null;
}

/** The old system stored the payout channel in ID_Type, not an identity document. */
const MOMO_CHANNELS = new Set(['MTN', 'VODAFONE', 'AIRTEL-TIGO', 'MTN MOMO', 'TIGO', 'AIRTEL', 'TELECEL']);

function receivingModeOf(idType: string | null, hasMomoNumber: boolean): 'CASH' | 'MOMO' {
  const t = (idType ?? '').trim().toUpperCase();
  if (MOMO_CHANNELS.has(t)) return 'MOMO';
  // Blank ID_Type is common; fall back to whether the name carries a number.
  if (!t && hasMomoNumber) return 'MOMO';
  return 'CASH';
}

/** "CHARLES NEWMAN 0244767649" → { name, momo } */
const TRAILING_NUMBER = /^(.*?)[\s,\-–—:]*(\d[\d\s\-]{7,})\s*$/;

function splitRecipient(raw: string): { name: string; momo: string | null } {
  const text = tidyName(raw);
  const m = text.match(TRAILING_NUMBER);
  if (!m) return { name: text, momo: null };
  const name = tidyName(m[1]);
  const { value } = normaliseMomoNumber(m[2]);
  // A number with no name in front of it is more likely a mangled row than a payout.
  if (!name) return { name: text, momo: null };
  return { name, momo: value };
}

function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDay(d: Date): string {
  return utcDay(d).toISOString().slice(0, 10);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!CONFIRM) console.log('DRY RUN — nothing will be written. Pass --confirm to apply.\n');

  for (const v of ['LEGACY_DB_SERVER', 'LEGACY_DB_NAME', 'LEGACY_DB_USER', 'LEGACY_DB_PASS']) {
    if (!process.env[v]) throw new Error(`Missing ${v} in the environment.`);
  }

  // ── Destination prerequisites ──────────────────────────────────────────────
  const branch = await prisma.receivingPoint.findUnique({ where: { code: BRANCH_CODE } });
  if (!branch) throw new Error(`Receiving point "${BRANCH_CODE}" not found.`);

  const actor = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!actor) throw new Error('No active SUPER_ADMIN to own the migrated records.');

  console.log(`Target branch : ${branch.name} (${branch.code})`);
  console.log(`Recorded by   : ${actor.firstName} ${actor.lastName}`);
  console.log(`Scope         : ${YEAR ? `year ${YEAR}` : 'all years'}\n`);

  // ── Pull the source ────────────────────────────────────────────────────────
  const pool = await sql.connect({
    server: process.env.LEGACY_DB_SERVER!,
    database: process.env.LEGACY_DB_NAME!,
    user: process.env.LEGACY_DB_USER!,
    password: process.env.LEGACY_DB_PASS!,
    port: 1433,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 30_000,
    requestTimeout: 300_000,
  });

  // One delivery row per transaction — the handful with several collapse to the
  // earliest, which is the one that actually settled the transaction.
  const rows: LegacyRow[] = (
    await pool.request().query(`
      SELECT r.TransAuto, r.TransDate, r.Sender, r.Recipient,
             CAST(r.CAN_Amount AS float) AS CAN_Amount,
             CAST(r.Amount AS float)     AS Amount,
             r.Delivered, r.Returned,
             d.DeliveryDate, d.ID_Type, d.Inputer AS DeliveredBy, d.ReceivedBy, d.ReceiptNo
      FROM petros_MoneyRec_utbl r
      OUTER APPLY (
        SELECT TOP 1 x.DeliveryDate, x.ID_Type, x.Inputer, x.ReceivedBy, x.ReceiptNo
        FROM petros_MoneyDelivered_utbl x
        WHERE x.TransAuto = r.TransAuto
        ORDER BY x.DeliveryDate ASC, x.DeliveryTransAuto ASC
      ) d
      ${YEAR ? `WHERE YEAR(r.TransDate) = ${Number(YEAR)}` : ''}
      ORDER BY r.TransAuto
    `)
  ).recordset as LegacyRow[];
  await pool.close();

  console.log(`Source rows fetched: ${rows.length.toLocaleString()}\n`);

  // ── Skip anything already migrated ─────────────────────────────────────────
  const existing = await prisma.transaction.findMany({
    where: { notes: { startsWith: '[legacy:' } },
    select: { notes: true },
  });
  const done = new Set<number>();
  for (const t of existing) {
    const m = t.notes?.match(/^\[legacy:(\d+)\]/);
    if (m) done.add(Number(m[1]));
  }
  if (done.size) console.log(`Already migrated, will skip: ${done.size.toLocaleString()}\n`);

  const pending = rows.filter((r) => !done.has(r.TransAuto));
  if (pending.length === 0) {
    console.log('Nothing left to migrate.');
    return;
  }

  // ── One exchange rate per business day (modal implied rate) ────────────────
  const ratesByDay = new Map<string, Map<number, number>>();
  for (const r of pending) {
    if (!(r.CAN_Amount > 0) || !(r.Amount > 0)) continue;
    const day = isoDay(r.TransDate);
    const rate = Math.round((r.Amount / r.CAN_Amount) * 10000) / 10000;
    if (!ratesByDay.has(day)) ratesByDay.set(day, new Map());
    const counts = ratesByDay.get(day)!;
    counts.set(rate, (counts.get(rate) ?? 0) + 1);
  }
  const dayRate = new Map<string, number>();
  for (const [day, counts] of ratesByDay) {
    let best = 0, bestRate = 0;
    for (const [rate, n] of counts) if (n > best) { best = n; bestRate = rate; }
    dayRate.set(day, bestRate);
  }

  // A few legacy days hold a single row with a zero CAD amount, so no rate can be
  // derived from them. Borrow the nearest day that has one rather than drop the
  // transaction — the GHS figure is real and the row still belongs in the history.
  const ratedDays = [...dayRate.keys()].sort();
  const nearestRate = (day: string): number => {
    if (dayRate.has(day)) return dayRate.get(day)!;
    let closest = ratedDays[0];
    let bestGap = Infinity;
    const target = Date.parse(day);
    for (const d of ratedDays) {
      const gap = Math.abs(Date.parse(d) - target);
      if (gap < bestGap) { bestGap = gap; closest = d; }
    }
    return closest ? dayRate.get(closest)! : 0;
  };
  for (const r of pending) {
    const day = isoDay(r.TransDate);
    if (!dayRate.has(day)) dayRate.set(day, nearestRate(day));
  }

  const existingRates = await prisma.exchangeRate.findMany({ select: { id: true, date: true } });
  const rateIdByDay = new Map<string, string>();
  for (const r of existingRates) rateIdByDay.set(r.date.toISOString().slice(0, 10), r.id);

  const newRates: Prisma.ExchangeRateCreateManyInput[] = [];
  for (const [day, rate] of dayRate) {
    if (rateIdByDay.has(day)) continue;
    const id = randomUUID();
    rateIdByDay.set(day, id);
    newRates.push({
      id,
      date: new Date(`${day}T00:00:00.000Z`),
      cadToGhs: new Prisma.Decimal(rate.toFixed(4)),
      setBy: actor.id,
      setByName: 'Legacy migration',
      isActive: false,
    });
  }

  // ── Existing senders / receivers ───────────────────────────────────────────
  const senderByName = new Map<string, string>();
  for (const s of await prisma.sender.findMany({ select: { id: true, firstName: true, lastName: true } })) {
    const k = nameKey(`${s.firstName} ${s.lastName}`);
    if (!senderByName.has(k)) senderByName.set(k, s.id);
  }
  const receiverByKey = new Map<string, string>();
  for (const r of await prisma.receiver.findMany({ select: { id: true, firstName: true, lastName: true, senderId: true } })) {
    const k = `${r.senderId}::${nameKey(`${r.firstName} ${r.lastName}`)}`;
    if (!receiverByKey.has(k)) receiverByKey.set(k, r.id);
  }

  // Codes are day-scoped and 1000 wide; reserve what the database already holds.
  const usedCodes = new Set(
    (await prisma.transaction.findMany({ select: { transactionCode: true } })).map((t) => t.transactionCode)
  );

  // ── Build everything in memory ─────────────────────────────────────────────
  const newSenders: Prisma.SenderCreateManyInput[] = [];
  const newReceivers: Prisma.ReceiverCreateManyInput[] = [];
  const newTransactions: Prisma.TransactionCreateManyInput[] = [];

  const stats = { paid: 0, cancelled: 0, unpaid: 0, momo: 0, cash: 0, badCad: 0, noName: 0, codeFail: 0 };

  for (const r of pending) {
    const day = isoDay(r.TransDate);
    const rateId = rateIdByDay.get(day);
    if (!rateId) { stats.codeFail++; continue; }   // day had no usable rate at all

    // Sender
    const senderRaw = tidyName(r.Sender ?? '') || 'UNKNOWN SENDER';
    if (!tidyName(r.Sender ?? '')) stats.noName++;
    const sKey = nameKey(senderRaw);
    let senderId = senderByName.get(sKey);
    if (!senderId) {
      senderId = randomUUID();
      const { firstName, lastName } = splitName(senderRaw);
      newSenders.push({ id: senderId, firstName, lastName, phone: '', country: 'Canada', createdById: actor.id });
      senderByName.set(sKey, senderId);
    }

    // Receiver (+ momo number carried in the name)
    const { name: recipName, momo } = splitRecipient(r.Recipient ?? '');
    const receiverName = recipName || 'UNKNOWN RECIPIENT';
    const mode = receivingModeOf(r.ID_Type, Boolean(momo));
    mode === 'MOMO' ? stats.momo++ : stats.cash++;

    const rKey = `${senderId}::${nameKey(receiverName)}`;
    let receiverId = receiverByKey.get(rKey);
    if (!receiverId) {
      receiverId = randomUUID();
      const { firstName, lastName } = splitName(receiverName);
      newReceivers.push({
        id: receiverId, firstName, lastName, senderId,
        phone: momo ?? '',
        preferredMethod: mode,
        momoNumber: mode === 'MOMO' ? momo : null,
      });
      receiverByKey.set(rKey, receiverId);
    }

    // Amounts — 170 legacy rows carry a non-positive CAD figure.
    const cad = money(r.CAN_Amount);
    const ghs = money(r.Amount);
    if (!(cad > 0)) stats.badCad++;
    const effectiveRate = cad > 0 ? ghs / cad : (dayRate.get(day) ?? 0);

    // Status
    let status: 'PAID' | 'CANCELLED' | 'SYNCED';
    if (r.Returned === 1) { status = 'CANCELLED'; stats.cancelled++; }
    else if (r.Delivered === 1) { status = 'PAID'; stats.paid++; }
    else { status = 'SYNCED'; stats.unpaid++; }

    // Code
    let code = '';
    const bd = utcDay(r.TransDate);
    for (let i = 0; i < 4000; i++) {
      const c = generateTransactionCode(bd, 'STANDARD', generateShortTransactionCode(bd));
      if (!usedCodes.has(c)) { code = c; usedCodes.add(c); break; }
    }
    if (!code) { stats.codeFail++; continue; }

    const note = [
      `[legacy:${r.TransAuto}]`,
      `migrated from Petros MoneyRec`,
      r.ReceiptNo ? `receipt ${String(r.ReceiptNo).trim()}` : null,
      r.DeliveredBy ? `paid by ${String(r.DeliveredBy).trim()}` : null,
      `branch not recorded in source — assigned ${branch.code}`,
      cad > 0 ? null : 'source CAD amount was not positive',
    ].filter(Boolean).join(' · ');

    newTransactions.push({
      id: randomUUID(),
      transactionCode: code,
      codeType: 'STANDARD',
      senderId,
      receiverId,
      cadAmount: new Prisma.Decimal(cad.toFixed(2)),
      ghsAmount: new Prisma.Decimal(ghs.toFixed(2)),
      exchangeRateId: rateId,
      exchangeRateUsed: new Prisma.Decimal(effectiveRate.toFixed(4)),
      paymentMethod: 'CASH',
      amountPaidCAD: new Prisma.Decimal(cad > 0 ? cad.toFixed(2) : '0'),
      amountPendingCAD: new Prisma.Decimal(0),
      receivingMode: mode,
      receivingPointId: branch.id,
      momoNumber: mode === 'MOMO' ? momo : null,
      momoName: mode === 'MOMO' ? receiverName : null,
      status,
      syncedToReceiving: true,
      syncedAt: r.TransDate,
      paidAt: status === 'PAID' ? (r.DeliveryDate ?? r.TransDate) : null,
      paidByName: status === 'PAID' && r.DeliveredBy ? String(r.DeliveredBy).trim() : null,
      transactionDate: bd,
      createdAt: r.TransDate,
      notes: note,
      createdById: actor.id,
    });
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('Prepared:');
  console.log(`  transactions   ${newTransactions.length.toLocaleString()}`);
  console.log(`  new senders    ${newSenders.length.toLocaleString()}`);
  console.log(`  new receivers  ${newReceivers.length.toLocaleString()}`);
  console.log(`  new day-rates  ${newRates.length.toLocaleString()}`);
  console.log(`\n  status  paid ${stats.paid.toLocaleString()} · cancelled ${stats.cancelled.toLocaleString()} · unpaid ${stats.unpaid.toLocaleString()}`);
  console.log(`  mode    momo ${stats.momo.toLocaleString()} · cash ${stats.cash.toLocaleString()}`);
  console.log(`  flags   non-positive CAD ${stats.badCad} · blank sender ${stats.noName} · skipped ${stats.codeFail}`);

  if (!CONFIRM) {
    console.log('\nDry run complete — pass --confirm to write.');
    return;
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  // Parents before children; chunked so no single statement is enormous.
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  console.log('\nWriting…');
  for (const c of chunk(newRates, BATCH)) await prisma.exchangeRate.createMany({ data: c, skipDuplicates: true });
  console.log(`  rates      ${newRates.length.toLocaleString()}`);
  for (const c of chunk(newSenders, BATCH)) await prisma.sender.createMany({ data: c, skipDuplicates: true });
  console.log(`  senders    ${newSenders.length.toLocaleString()}`);
  for (const c of chunk(newReceivers, BATCH)) await prisma.receiver.createMany({ data: c, skipDuplicates: true });
  console.log(`  receivers  ${newReceivers.length.toLocaleString()}`);

  let written = 0;
  for (const c of chunk(newTransactions, BATCH)) {
    await prisma.transaction.createMany({ data: c, skipDuplicates: true });
    written += c.length;
    process.stdout.write(`\r  transactions ${written.toLocaleString()} / ${newTransactions.length.toLocaleString()}`);
  }
  console.log('\n');

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      userName: `${actor.firstName} ${actor.lastName}`,
      userRole: 'SUPER_ADMIN',
      action: 'MIGRATE_LEGACY_REMITTANCE',
      entity: 'Migration',
      entityId: `petros-${YEAR ?? 'all'}-${BRANCH_CODE}`,
      changes: {
        source: 'petros_MoneyRec_utbl + petros_MoneyDelivered_utbl',
        branch: branch.code, year: YEAR ?? 'all',
        transactions: newTransactions.length,
        senders: newSenders.length, receivers: newReceivers.length, rates: newRates.length,
        ...stats,
      },
    },
  });

  console.log('Done. No journal entries or ledger movements were created.');
}

main()
  .catch((e) => { console.error('\nMIGRATION FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
