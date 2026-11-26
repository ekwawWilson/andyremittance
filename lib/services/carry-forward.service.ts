/**
 * carry-forward.service — moves a sender's leftover balance onto their newest transfer.
 *
 * A sender such as a business that loads funds and pays many suppliers often
 * has money left on a transfer when the next one arrives. Without this, those
 * leftovers sit on old transfers as small fragments that never clear.
 *
 * Rule: when a new STANDARD transfer becomes payable (SYNCED) at a branch, every
 * OLDER transfer of the same sender at the same branch that has been PART-PAID
 * (status PARTIAL_PAYMENT) has its remaining balance carried into the new one:
 *
 *   old: carriedOutGHS += remaining, carriedForwardToId = new, status → PAID
 *   new: carriedInGHS  += remaining
 *
 * Untouched (SYNCED, nothing paid) older transfers are left alone — they are
 * not fragments, and closing them would leave empty "paid" transfers behind.
 *
 * ghsAmount is never edited, so day sheets and the CAD statement stay true.
 * The amount payable on any transfer is   ghsAmount + carriedInGHS - carriedOutGHS.
 *
 * Ledger: payouts post to pooled branch accounts (teller till, PAYABLE-GHS-{branch}),
 * so moving a balance between two transfers of the same branch needs no ledger
 * entry — the branch still owes exactly the same total.
 */

import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const fromCents = (c: number) => c / 100;

/** Total GHS payable on a transfer, including balances carried in or out. */
export function payableGHS(t: {
  ghsAmount: Prisma.Decimal | number | string;
  carriedInGHS?: Prisma.Decimal | number | string | null;
  carriedOutGHS?: Prisma.Decimal | number | string | null;
}): number {
  return fromCents(toCents(t.ghsAmount) + toCents(t.carriedInGHS) - toCents(t.carriedOutGHS));
}

export interface CarryForwardResult {
  toTransactionId: string;
  toTransactionCode: string;
  totalCarried: number;
  from: Array<{ transactionId: string; transactionCode: string; amount: number }>;
}

/**
 * Carry part-paid older balances of the same sender into `newTransactionId`.
 * Must run inside the transaction that makes the new transfer payable.
 * Returns null when there was nothing to carry.
 */
export async function carryForwardInto(
  tx: TxClient,
  newTransactionId: string,
  actor: { userId?: string | null; userName: string }
): Promise<CarryForwardResult | null> {
  const target = await tx.transaction.findUnique({
    where: { id: newTransactionId },
    select: {
      id: true,
      transactionCode: true,
      senderId: true,
      receivingPointId: true,
      codeType: true,
      status: true,
      transactionDate: true,
      createdAt: true,
    },
  });
  if (!target || target.codeType !== 'STANDARD' || target.status !== 'SYNCED') return null;

  // Lock the candidate older transfers (stable id order avoids deadlocks).
  const candidates = await tx.$queryRaw<Array<{
    id: string;
    transactionCode: string;
    ghsAmount: string;
    carriedInGHS: string;
    carriedOutGHS: string;
  }>>`
    SELECT id, "transactionCode", "ghsAmount", "carriedInGHS", "carriedOutGHS"
    FROM "Transaction"
    WHERE "senderId" = ${target.senderId}
      AND "receivingPointId" = ${target.receivingPointId}
      AND "codeType"::text = 'STANDARD'
      AND status::text = 'PARTIAL_PAYMENT'
      AND id <> ${target.id}
      AND ("transactionDate" < ${target.transactionDate}
           OR ("transactionDate" = ${target.transactionDate} AND "createdAt" < ${target.createdAt}))
    ORDER BY id
    FOR UPDATE
  `;
  if (candidates.length === 0) return null;

  const sums = await tx.subPayment.groupBy({
    by: ['transactionId'],
    where: { transactionId: { in: candidates.map((c) => c.id) } },
    _sum: { ghsAmount: true },
  });
  const paid = new Map(sums.map((s) => [s.transactionId, toCents(s._sum.ghsAmount)]));

  const now = new Date();
  const from: CarryForwardResult['from'] = [];

  for (const c of candidates) {
    const remainingCents =
      toCents(c.ghsAmount) + toCents(c.carriedInGHS) - toCents(c.carriedOutGHS) - (paid.get(c.id) ?? 0);
    if (remainingCents <= 0) continue;

    await tx.transaction.update({
      where: { id: c.id },
      data: {
        carriedOutGHS: { increment: fromCents(remainingCents) },
        carriedForwardToId: target.id,
        carriedForwardAt: now,
        status: 'PAID',
        paidAt: now,
        paidByName: `Balance carried forward to ${target.transactionCode}`,
      },
    });
    from.push({ transactionId: c.id, transactionCode: c.transactionCode, amount: fromCents(remainingCents) });
  }

  if (from.length === 0) return null;

  const totalCents = from.reduce((s, f) => s + toCents(f.amount), 0);
  await tx.transaction.update({
    where: { id: target.id },
    data: { carriedInGHS: { increment: fromCents(totalCents) } },
  });

  const result: CarryForwardResult = {
    toTransactionId: target.id,
    toTransactionCode: target.transactionCode,
    totalCarried: fromCents(totalCents),
    from,
  };

  await tx.auditLog.create({
    data: {
      userId: actor.userId ?? null,
      userName: actor.userName,
      action: 'BALANCE_CARRIED_FORWARD',
      entity: 'Transaction',
      entityId: target.id,
      changes: JSON.parse(JSON.stringify(result)),
    },
  });

  return result;
}

/**
 * Run carry-forward for a batch of newly payable transfers (import / EOD sync).
 * Two up-front queries find which senders actually have a part-paid transfer,
 * so a large batch does no per-row work unless a carry-forward is needed.
 * Balances go into the batch's earliest transfer for that sender + branch.
 */
export async function carryForwardIntoMany(
  tx: TxClient,
  transactionIds: string[],
  actor: { userId?: string | null; userName: string }
): Promise<CarryForwardResult[]> {
  if (transactionIds.length === 0) return [];

  const fresh = await tx.transaction.findMany({
    where: { id: { in: transactionIds }, codeType: 'STANDARD', status: 'SYNCED' },
    select: { id: true, senderId: true, receivingPointId: true },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  if (fresh.length === 0) return [];

  const partial = await tx.transaction.findMany({
    where: {
      status: 'PARTIAL_PAYMENT',
      codeType: 'STANDARD',
      senderId: { in: [...new Set(fresh.map((f) => f.senderId))] },
      receivingPointId: { in: [...new Set(fresh.map((f) => f.receivingPointId))] },
    },
    select: { senderId: true, receivingPointId: true },
    distinct: ['senderId', 'receivingPointId'],
  });
  const pending = new Set(partial.map((p) => `${p.senderId}|${p.receivingPointId}`));

  const results: CarryForwardResult[] = [];
  for (const f of fresh) {
    const key = `${f.senderId}|${f.receivingPointId}`;
    if (!pending.has(key)) continue;
    pending.delete(key); // only the earliest new transfer per sender + branch receives it
    const r = await carryForwardInto(tx, f.id, actor);
    if (r) results.push(r);
  }
  return results;
}
