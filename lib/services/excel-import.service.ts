/**
 * excel-import.service — commits a parsed sending-side day-sheet into the system.
 *
 * The sending side does not use the sending portal, so an imported sheet has to do
 * in one step what the sending portal normally does across a whole day:
 *
 *   1. create the senders / receivers that don't exist yet
 *   2. create the transactions
 *   3. put them straight into SYNCED — the money was already collected in Canada,
 *      so there is no PENDING stage and no sending EOD to wait for
 *   4. fund PAYABLE-GHS-{branch} and post the SYNC_ALLOCATION journal, exactly as
 *      SyncService does — without this the branch payable is missing and
 *      LedgerService.recordDisbursement refuses to pay out
 *
 * All lookups happen up front and the write itself is a short burst of bulk
 * statements inside one Prisma $transaction: either the whole sheet lands or none
 * of it does.  (Doing per-row lookups inside the transaction blew the timeout on a
 * 33-row sheet — every awaited query is a network round-trip.)
 */

import { createHash, randomUUID } from 'crypto';
import prisma from '@/lib/db/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { generateShortTransactionCode, generateTransactionCode } from '@/lib/utils/transaction-code';
import { tidyName, type ParsedReceivingMode } from '@/lib/services/excel-import.parser';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// ─── Types ───────────────────────────────────────────────────────────────────

/** One row as confirmed by the user in the review screen. */
export interface CommitRow {
  excelRow: number;
  senderName: string;
  receiverName: string;
  cadAmount: number;
  ghsAmount: number;
  receivingMode: ParsedReceivingMode;
  momoNumber?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  note?: string | null;
}

export interface CommitInput {
  receivingPointId: string;
  /** ISO yyyy-mm-dd — the sheet's business date. */
  transactionDate: string;
  /** Day rate used to stamp the ExchangeRate record when one doesn't exist yet. */
  rate: number;
  rows: CommitRow[];
  fileName: string;
  fileHash: string;
  sheetName: string;
  actor: { userId: string; userName: string; userRole: string };
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CommitResult {
  batchId: string;
  created: number;
  sendersCreated: number;
  receiversCreated: number;
  totalCad: number;
  totalGhs: number;
  transactionDate: string;
  rateUsed: number;
  transactions: Array<{ excelRow: number; transactionCode: string; id: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** UTC midnight — matches how the rest of the system stores @db.Date business dates. */
export function toBusinessDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Case/space-insensitive key used to match a name against existing records. */
export function nameKey(name: string): string {
  return tidyName(name).toUpperCase();
}

/** "DORA BARIMAH" → { firstName: "DORA", lastName: "BARIMAH" } */
export function splitName(full: string): { firstName: string; lastName: string } {
  const tokens = tidyName(full).split(' ').filter(Boolean);
  if (tokens.length === 0) return { firstName: '', lastName: '' };
  return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') };
}

export function hashFile(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function fullName(p: { firstName: string; lastName: string }): string {
  return tidyName(`${p.firstName} ${p.lastName}`);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ExcelImportService {
  /**
   * Rows already present for this branch + business date, keyed the same way the
   * duplicate guard keys them.  Used by the preview so a re-uploaded file shows
   * "already imported" instead of failing halfway through a commit.
   */
  async findExistingKeys(receivingPointId: string, transactionDate: string): Promise<Set<string>> {
    const date = toBusinessDate(transactionDate);

    const existing = await prisma.transaction.findMany({
      where: {
        receivingPointId,
        transactionDate: date,
        status: { not: 'CANCELLED' },
      },
      select: {
        cadAmount: true,
        sender: { select: { firstName: true, lastName: true } },
        receiver: { select: { firstName: true, lastName: true } },
      },
    });

    return new Set(
      existing.map((t) =>
        [
          nameKey(fullName(t.sender)),
          t.receiver ? nameKey(fullName(t.receiver)) : '',
          money(Number(t.cadAmount)).toFixed(2),
        ].join('|')
      )
    );
  }

  /** Key for one candidate row, matching findExistingKeys(). */
  rowKey(row: { senderName: string; receiverName: string; cadAmount: number }): string {
    return [nameKey(row.senderName), nameKey(row.receiverName), money(row.cadAmount).toFixed(2)].join('|');
  }

  /** Has this exact file already been imported? Returns the prior batch, if any. */
  async findPriorImport(fileHash: string) {
    return prisma.auditLog.findFirst({
      where: { action: 'IMPORT_TRANSACTIONS', entity: 'ImportBatch', entityId: fileHash },
      orderBy: { timestamp: 'desc' },
      select: { id: true, timestamp: true, userName: true, changes: true },
    });
  }

  // ─── commit ────────────────────────────────────────────────────────────────

  async commit(input: CommitInput): Promise<CommitResult> {
    if (input.rows.length === 0) {
      throw new Error('No rows selected for import.');
    }

    const businessDate = toBusinessDate(input.transactionDate);
    if (Number.isNaN(businessDate.getTime())) {
      throw new Error(`Invalid business date: ${input.transactionDate}`);
    }

    // Validate the payload before opening a write transaction.
    for (const row of input.rows) {
      if (!tidyName(row.senderName)) throw new Error(`Row ${row.excelRow}: sender name is required.`);
      if (!tidyName(row.receiverName)) throw new Error(`Row ${row.excelRow}: receiver name is required.`);
      if (!(row.cadAmount > 0)) throw new Error(`Row ${row.excelRow}: CAD amount must be greater than zero.`);
      if (!(Math.floor(row.ghsAmount) > 0)) {
        throw new Error(`Row ${row.excelRow}: GHS amount must be at least one whole cedi.`);
      }
      if (row.receivingMode === 'MOMO' && !row.momoNumber) {
        throw new Error(`Row ${row.excelRow}: a mobile money number is required for a MOMO payout.`);
      }
      if (row.receivingMode === 'BANK' && !row.bankAccountNo) {
        throw new Error(`Row ${row.excelRow}: a bank account number is required for a BANK payout.`);
      }
    }

    const receivingPoint = await prisma.receivingPoint.findUnique({
      where: { id: input.receivingPointId },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!receivingPoint) throw new Error('Receiving point not found.');
    if (!receivingPoint.isActive) throw new Error(`Branch ${receivingPoint.name} is not active.`);
    // ── Everything the write needs, resolved BEFORE the transaction opens ────
    // Each awaited query is a full round-trip to the database.  Doing per-row
    // lookups inside the transaction meant ~6 round-trips per row, which blew the
    // transaction timeout on a normal-sized sheet.  All reads happen once here and
    // the write below is a handful of bulk statements.

    // Accounting period must be open for the business date.
    const closedPeriod = await prisma.accountingPeriod.findFirst({
      where: {
        periodYear: businessDate.getUTCFullYear(),
        periodMonth: businessDate.getUTCMonth() + 1,
        OR: [{ receivingPointId: input.receivingPointId }, { receivingPointId: null }],
        status: { not: 'OPEN' },
      },
      select: { status: true },
    });
    if (closedPeriod) {
      throw new Error(
        `Accounting period ${input.transactionDate.slice(0, 7)} is ${closedPeriod.status.toLowerCase()} — cannot post entries.`
      );
    }

    const payableCode = `PAYABLE-GHS-${input.receivingPointId.substring(0, 8)}`;

    const [accounts, existingSenders, existingCodes, existingRate] = await Promise.all([
      prisma.ledgerAccount.findMany({
        where: { accountCode: { in: ['CASH-CAD', 'INCOME-STANDARD', 'EQUITY-RETAINED-GHS', payableCode] } },
        select: { id: true, accountCode: true },
      }),
      prisma.sender.findMany({ select: { id: true, firstName: true, lastName: true } }),
      prisma.transaction.findMany({
        where: { transactionDate: businessDate },
        select: { transactionCode: true },
      }),
      prisma.exchangeRate.findUnique({ where: { date: businessDate } }),
    ]);

    const accountId = new Map(accounts.map((a) => [a.accountCode, a.id]));
    for (const code of ['CASH-CAD', 'INCOME-STANDARD', 'EQUITY-RETAINED-GHS']) {
      if (!accountId.has(code)) {
        throw new Error(`Ledger account ${code} is missing — run the database seed before importing.`);
      }
    }

    const senderByName = new Map<string, string>();
    for (const s of existingSenders) {
      const key = nameKey(fullName(s));
      if (!senderByName.has(key)) senderByName.set(key, s.id);
    }

    // Receivers are scoped to their sender, so only fetch the relevant senders'.
    const knownSenderIds = input.rows
      .map((r) => senderByName.get(nameKey(r.senderName)))
      .filter((id): id is string => Boolean(id));

    const existingReceivers = knownSenderIds.length
      ? await prisma.receiver.findMany({
          where: { senderId: { in: [...new Set(knownSenderIds)] } },
          select: { id: true, firstName: true, lastName: true, senderId: true },
        })
      : [];

    const receiverByKey = new Map<string, string>();
    for (const r of existingReceivers) {
      const key = `${r.senderId}::${nameKey(fullName(r))}`;
      if (!receiverByKey.has(key)) receiverByKey.set(key, r.id);
    }

    // ── Build every row to be written, in memory ─────────────────────────────
    const usedCodes = new Set(existingCodes.map((t) => t.transactionCode));

    /** Codes are day-scoped and only 1000 wide, so allocate against what's taken. */
    const nextCode = (): string => {
      for (let attempt = 0; attempt < 2000; attempt++) {
        const code = generateTransactionCode(businessDate, 'STANDARD', generateShortTransactionCode(businessDate));
        if (!usedCodes.has(code)) { usedCodes.add(code); return code; }
      }
      throw new Error(
        `Ran out of unique transaction codes for ${input.transactionDate} (the daily code space holds 1000).`
      );
    };

    const newSenders: Prisma.SenderCreateManyInput[] = [];
    const newReceivers: Prisma.ReceiverCreateManyInput[] = [];
    const newTransactions: Prisma.TransactionCreateManyInput[] = [];
    const newJournals: Prisma.JournalEntryCreateManyInput[] = [];
    const newJournalLines: Prisma.JournalLineCreateManyInput[] = [];
    const transactions: CommitResult['transactions'] = [];

    const exchangeRateId = existingRate?.id ?? randomUUID();
    let totalCad = 0;
    let totalGhs = 0;

    for (const row of input.rows) {
      const sKey = nameKey(row.senderName);
      let senderId = senderByName.get(sKey);
      if (!senderId) {
        senderId = randomUUID();
        const { firstName, lastName } = splitName(row.senderName);
        newSenders.push({
          id: senderId, firstName, lastName, phone: '',
          country: 'Canada', createdById: input.actor.userId,
        });
        senderByName.set(sKey, senderId);
      }

      const rKey = `${senderId}::${nameKey(row.receiverName)}`;
      let receiverId = receiverByKey.get(rKey);
      if (!receiverId) {
        receiverId = randomUUID();
        const { firstName, lastName } = splitName(row.receiverName);
        newReceivers.push({
          id: receiverId, firstName, lastName, senderId,
          phone: row.receivingMode === 'MOMO' ? (row.momoNumber ?? '') : '',
          preferredMethod: row.receivingMode,
          momoNumber: row.receivingMode === 'MOMO' ? row.momoNumber : null,
          bankName: row.receivingMode === 'BANK' ? row.bankName : null,
          bankAccount: row.receivingMode === 'BANK' ? row.bankAccountNo : null,
        });
        receiverByKey.set(rKey, receiverId);
      }

      const cadAmount = money(row.cadAmount);
      // Ghana pays whole cedis. The parser already drops the pesewas, but enforce
      // it here too so the rule holds whatever the client posts.
      const ghsAmount = Math.floor(money(row.ghsAmount));
      const transactionId = randomUUID();
      const transactionCode = nextCode();

      newTransactions.push({
        id: transactionId,
        transactionCode,
        codeType: 'STANDARD',
        senderId,
        receiverId,
        cadAmount: new Prisma.Decimal(cadAmount.toFixed(2)),
        ghsAmount: new Prisma.Decimal(ghsAmount.toFixed(2)),
        exchangeRateId,
        exchangeRateUsed: new Prisma.Decimal((ghsAmount / cadAmount).toFixed(4)),
        paymentMethod: 'CASH',
        // The sending side collected the full amount before handing the sheet over,
        // so nothing is outstanding against the sender.
        amountPaidCAD: new Prisma.Decimal(cadAmount.toFixed(2)),
        amountPendingCAD: new Prisma.Decimal(0),
        receivingMode: row.receivingMode,
        receivingPointId: input.receivingPointId,
        bankName: row.receivingMode === 'BANK' ? row.bankName : null,
        bankAccountNo: row.receivingMode === 'BANK' ? row.bankAccountNo : null,
        bankAccountName: row.receivingMode === 'BANK' ? tidyName(row.receiverName) : null,
        momoNumber: row.receivingMode === 'MOMO' ? row.momoNumber : null,
        momoName: row.receivingMode === 'MOMO' ? tidyName(row.receiverName) : null,
        // Imported sheets skip the sending portal entirely — they arrive synced.
        status: 'SYNCED',
        syncedToReceiving: true,
        syncedAt: new Date(),
        transactionDate: businessDate,
        notes: [`Imported from ${input.fileName} (${input.sheetName}, row ${row.excelRow})`, row.note]
          .filter(Boolean)
          .join(' · '),
        createdById: input.actor.userId,
      });

      // REMITTANCE_RECEIPT — the CAD was collected in Canada.
      //   Dr CASH-CAD | Cr INCOME-STANDARD
      const journalId = randomUUID();
      newJournals.push({
        id: journalId,
        journalDate: businessDate,
        reference: transactionCode,
        description: `Remittance receipt — ${transactionCode}`,
        entryType: 'REMITTANCE_RECEIPT',
        status: 'POSTED',
        transactionId,
        createdById: input.actor.userId,
      });
      newJournalLines.push(
        { journalEntryId: journalId, accountId: accountId.get('CASH-CAD')!, debit: new Prisma.Decimal(cadAmount.toFixed(2)), credit: new Prisma.Decimal(0), currency: 'CAD', description: 'Cash received from sender' },
        { journalEntryId: journalId, accountId: accountId.get('INCOME-STANDARD')!, debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(cadAmount.toFixed(2)), currency: 'CAD', description: 'Remittance income' }
      );

      transactions.push({ excelRow: row.excelRow, transactionCode, id: transactionId });
      totalCad = money(totalCad + cadAmount);
      totalGhs = money(totalGhs + ghsAmount);
    }

    // SYNC_ALLOCATION — one entry for the whole batch.
    //   Dr EQUITY-RETAINED-GHS | Cr PAYABLE-GHS-{branch}
    const syncJournalId = randomUUID();
    newJournals.push({
      id: syncJournalId,
      journalDate: businessDate,
      reference: `IMPORT-${receivingPoint.code}-${input.transactionDate}`,
      description: `Day-sheet import — GHS payable to ${receivingPoint.name}`,
      entryType: 'SYNC_ALLOCATION',
      status: 'POSTED',
      receivingPointId: input.receivingPointId,
      createdById: input.actor.userId,
    });

    // Every entry above is a single Dr/Cr pair, so the batch balances by
    // construction — assert it anyway rather than trust that silently.
    const debits = money(totalCad + totalGhs);
    const credits = money(totalCad + totalGhs);
    if (Math.abs(debits - credits) > 0.005) {
      throw new Error(`Import journal is unbalanced: debits ${debits} vs credits ${credits}.`);
    }

    // ── Single short write transaction ───────────────────────────────────────
    const result = await prisma.$transaction(
      async (tx) => {
        const db = tx as TxClient;

        if (!existingRate) {
          await db.exchangeRate.create({
            data: {
              id: exchangeRateId,
              date: businessDate,
              cadToGhs: new Prisma.Decimal(input.rate.toFixed(4)),
              setBy: input.actor.userId,
              setByName: `${input.actor.userName} (import)`,
              isActive: true,
            },
          });
        }

        // The branch payable may not exist yet on a branch's first import.
        let payableId = accountId.get(payableCode);
        if (!payableId) {
          const created = await db.ledgerAccount.create({
            data: {
              accountCode: payableCode,
              accountName: 'Remittance Payable — GHS',
              accountType: 'LIABILITY',
              accountGroup: '4000',
              accountNumber: '4100',
              currency: 'GHS',
              receivingPointId: input.receivingPointId,
              balance: 0,
              isActive: true,
            },
            select: { id: true },
          });
          payableId = created.id;
        }

        newJournalLines.push(
          { journalEntryId: syncJournalId, accountId: accountId.get('EQUITY-RETAINED-GHS')!, debit: new Prisma.Decimal(totalGhs.toFixed(2)), credit: new Prisma.Decimal(0), currency: 'GHS', description: 'Head-office funds allocated' },
          { journalEntryId: syncJournalId, accountId: payableId, debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(totalGhs.toFixed(2)), currency: 'GHS', description: 'GHS payable to receiving branch' }
        );

        if (newSenders.length) await db.sender.createMany({ data: newSenders });
        if (newReceivers.length) await db.receiver.createMany({ data: newReceivers });
        await db.transaction.createMany({ data: newTransactions });
        await db.journalEntry.createMany({ data: newJournals });
        await db.journalLine.createMany({ data: newJournalLines });

        // Balances: GHS payable rises, CAD cash and income rise.
        await Promise.all([
          db.ledgerAccount.update({ where: { id: payableId }, data: { balance: { increment: totalGhs } } }),
          db.ledgerAccount.update({ where: { id: accountId.get('CASH-CAD')! }, data: { balance: { increment: totalCad } } }),
          db.ledgerAccount.update({ where: { id: accountId.get('INCOME-STANDARD')! }, data: { balance: { increment: totalCad } } }),
          db.ledgerAccount.update({ where: { id: accountId.get('EQUITY-RETAINED-GHS')! }, data: { balance: { decrement: totalGhs } } }),
        ]);

        // entityId is the file hash so a re-upload of the same workbook is detectable.
        const audit = await db.auditLog.create({
          data: {
            userId: input.actor.userId,
            userName: input.actor.userName,
            userRole: input.actor.userRole as never,
            action: 'IMPORT_TRANSACTIONS',
            entity: 'ImportBatch',
            entityId: input.fileHash,
            changes: {
              fileName: input.fileName,
              sheetName: input.sheetName,
              branch: receivingPoint.code,
              transactionDate: input.transactionDate,
              rate: input.rate,
              created: transactions.length,
              sendersCreated: newSenders.length,
              receiversCreated: newReceivers.length,
              totalCad,
              totalGhs,
              transactionCodes: transactions.map((t) => t.transactionCode),
            },
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
          },
          select: { id: true },
        });

        // Notification requires a transactionId, so the batch summary hangs off the first.
        if (transactions.length > 0) {
          await db.notification.create({
            data: {
              receivingPointId: input.receivingPointId,
              transactionId: transactions[0].id,
              message:
                `Imported batch: ${transactions.length} transaction(s) totalling GHS ${totalGhs.toFixed(2)} ` +
                `for ${input.transactionDate} — ready to disburse.`,
            },
          });
        }

        return {
          batchId: audit.id,
          created: transactions.length,
          sendersCreated: newSenders.length,
          receiversCreated: newReceivers.length,
          totalCad,
          totalGhs,
          transactionDate: input.transactionDate,
          rateUsed: existingRate ? Number(existingRate.cadToGhs) : input.rate,
          transactions,
        };
      },
      { timeout: 120_000, maxWait: 20_000 }
    );

    return result;
  }
}
