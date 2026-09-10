/**
 * till-guards — the day-close controls around a teller's drawer.
 *
 * Two rules, both about not losing the ability to hold someone accountable:
 *
 *   1. A teller reconciles BEFORE returning cash to the vault. Reconciliation
 *      proves the drawer matches the books while the cash is still in the
 *      teller's custody. Once it has gone to the vault a shortage is ambiguous
 *      — teller or vault keeper? — and the variance journal, which posts
 *      against that teller's till, lands on an account the cash has left.
 *
 *      Reconciling an already-emptied drawer looks fine and proves nothing:
 *      expected closing and the counted total are both zero, so the variance is
 *      zero by construction.
 *
 *   2. Every till reads exactly zero before the branch closes its day, so no
 *      cash is left unaccounted for across a business date.
 */

import prisma from '@/lib/db/prisma';

/** Reconciliation states that count as "the teller has signed off on today". */
const SETTLED = ['COMPLETED', 'APPROVED'] as const;

/**
 * The branch's current business date, as UTC midnight. Cash movements are
 * judged against the branch's own day, not the wall clock.
 */
export async function branchBusinessDate(receivingPointId: string): Promise<Date> {
  const branch = await prisma.receivingPoint.findUnique({
    where: { id: receivingPointId },
    select: { serverDate: true },
  });
  const d = branch?.serverDate ?? new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Has this teller settled their reconciliation for the given business date?
 *
 * A PENDING reconciliation does not count: it carries a variance a supervisor
 * has not yet accepted, and letting the cash leave first would remove the
 * evidence needed to review it.
 */
export async function hasSettledReconciliation(
  tellerId: string,
  businessDate: Date
): Promise<{ settled: boolean; status: string | null }> {
  const nextDay = new Date(businessDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const latest = await prisma.tellerReconciliation.findFirst({
    where: {
      tellerId,
      reconciliationDate: { gte: businessDate, lt: nextDay },
    },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  });

  if (!latest) return { settled: false, status: null };
  return { settled: (SETTLED as readonly string[]).includes(latest.status), status: latest.status };
}

/**
 * Guard for a teller → vault cash return.
 *
 * Returns an explanatory message when the return should be refused, or null
 * when it may proceed.
 */
export async function blockUnreconciledVaultReturn(
  tellerId: string,
  receivingPointId: string
): Promise<string | null> {
  const businessDate = await branchBusinessDate(receivingPointId);
  const { settled, status } = await hasSettledReconciliation(tellerId, businessDate);
  if (settled) return null;

  const day = businessDate.toISOString().slice(0, 10);

  if (status === null) {
    return (
      `Reconcile your till for ${day} before returning cash to the vault. ` +
      `Counting the drawer after the cash has gone proves nothing — the expected and ` +
      `counted totals are both zero.`
    );
  }
  if (status === 'PENDING') {
    return (
      `Your reconciliation for ${day} has a variance still awaiting supervisor approval. ` +
      `The cash must stay in your till until it is reviewed.`
    );
  }
  if (status === 'REJECTED') {
    return `Your reconciliation for ${day} was rejected. Resubmit it before returning cash to the vault.`;
  }
  return `Your reconciliation for ${day} is ${status.toLowerCase()} — it must be completed or approved first.`;
}

/**
 * Tills that are not exactly zero, blocking branch EOD.
 *
 * Deliberately `!== 0` rather than `> 0`: a negative till means more was paid
 * out than the drawer ever held — an over-disbursement or a bad adjustment —
 * and closing the day on it silently carries the error into tomorrow.
 */
export function tillsNotZero<T extends { firstName: string; lastName: string; tellerLedger: Array<{ balance: unknown }> }>(
  tellers: T[]
): Array<{ teller: T; balance: number }> {
  return tellers
    .map((teller) => ({ teller, balance: Number(teller.tellerLedger[0]?.balance ?? 0) }))
    .filter(({ balance }) => balance !== 0);
}
