import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureReceivingPointAccess, requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';
import { normalizeDisbursementDetails, partialDisbursementSchema } from '@/lib/validators/disbursement';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

type OpenLoadRow = {
  id: string;
  status: string;
  ghsAmount: string;
  receivingPointId: string;
  codeType: string;
  transactionCode: string;
  transactionDate: Date;
  createdAt: Date;
};

type SubPaymentOutcome = {
  allocations: Array<{
    subPaymentId: string;
    transactionId: string;
    transactionCode: string;
    ghsAmount: number;
    remaining: number;
    isFullyPaid: boolean;
  }>;
  totalDisbursed: number;
  remaining: number;
  isFullyPaid: boolean;
  senderRemaining: number;
  senderFullyPaid: boolean;
};

// Work in integer pesewas to avoid float drift leaving 0.01 fragments behind.
const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const fromCents = (c: number) => c / 100;

// POST /api/transactions/[id]/sub-payments — record a partial disbursement
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const check = await requirePermission(request, 'MARK_PAID');
    if (check.denied) return check.response;
    const tellerId = check.ctx.userId;

    const user = await prisma.user.findUnique({
      where: { id: tellerId },
      select: { firstName: true, lastName: true },
    });
    if (!user) return errorResponse('User not found', 404);
    const tellerName = `${user.firstName} ${user.lastName}`;

    const body = await request.json();
    const parsed = partialDisbursementSchema.parse(body);
    const {
      ghsAmount,
      notes,
      receiverName,
      receiverPhone,
    } = parsed;
    const payoutDetails = normalizeDisbursementDetails(parsed);

    // Do a lightweight pre-flight read outside the transaction to return early
    // for obvious access/not-found errors without holding a row lock.
    const preCheck = await prisma.transaction.findUnique({
      where: { id },
      select: { id: true, receivingPointId: true },
    });
    if (!preCheck) return errorResponse('Transaction not found', 404);
    const accessError = ensureReceivingPointAccess(
      request,
      preCheck.receivingPointId,
      'Cannot record sub-payments for another receiving point'
    );
    if (accessError) return accessError;

    // All remaining checks and writes are inside a single $transaction.
    //
    // A sender (e.g. a business that loads funds and pays many suppliers) can
    // have several open loads at once. Payouts are applied OLDEST-LOAD-FIRST
    // across all of that sender's open loads at this receiving point (same
    // code type, so the same till is debited). This stops leftovers from older
    // loads being stranded as small fragments once a newer load arrives.
    //
    // Each slice is recorded as its own SubPayment + ledger entry against the
    // load it came from, so per-transaction accounting stays exact.
    //
    // SELECT FOR UPDATE on every open load of the sender (in a stable id order
    // to avoid deadlocks) serialises concurrent payouts for the same sender.
    let result!: SubPaymentOutcome;

    const subPayment = await prisma.$transaction(async (tx) => {
      const target = await tx.transaction.findUnique({
        where: { id },
        select: { senderId: true, receivingPointId: true, codeType: true },
      });
      if (!target) throw new Error('Transaction not found');

      const locked = await tx.$queryRaw<OpenLoadRow[]>`
        SELECT id, status, "ghsAmount", "receivingPointId", "codeType",
               "transactionCode", "transactionDate", "createdAt"
        FROM "Transaction"
        WHERE "senderId" = ${target.senderId}
          AND "receivingPointId" = ${target.receivingPointId}
          AND "codeType"::text = ${target.codeType}
          AND status::text IN ('SYNCED', 'PARTIAL_PAYMENT')
        ORDER BY id
        FOR UPDATE
      `;

      if (!locked.some((r) => r.id === id)) {
        throw new Error('Transaction must be SYNCED to record sub-payments');
      }

      // Re-sum sub-payments inside the lock so concurrent requests see fresh totals
      const sums = await tx.subPayment.groupBy({
        by: ['transactionId'],
        where: { transactionId: { in: locked.map((r) => r.id) } },
        _sum: { ghsAmount: true },
      });
      const disbursedById = new Map(sums.map((s) => [s.transactionId, toCents(s._sum.ghsAmount)]));

      const loads = locked
        .map((r) => {
          const totalCents = toCents(r.ghsAmount);
          const disbursedCents = disbursedById.get(r.id) ?? 0;
          return { ...r, totalCents, disbursedCents, remainingCents: Math.max(0, totalCents - disbursedCents) };
        })
        .filter((l) => l.remainingCents > 0)
        .sort(
          (a, b) =>
            new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime() ||
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
            a.id.localeCompare(b.id)
        );

      const senderRemainingCents = loads.reduce((s, l) => s + l.remainingCents, 0);
      const requestedCents = Math.round(ghsAmount * 100);

      if (requestedCents > senderRemainingCents) {
        throw new Error(
          `Amount exceeds remaining balance. Remaining across ${loads.length} open load(s): GHS ${fromCents(senderRemainingCents).toFixed(2)}`
        );
      }

      // Oldest-first allocation
      const allocations: Array<{ load: (typeof loads)[number]; cents: number }> = [];
      let left = requestedCents;
      for (const load of loads) {
        if (left <= 0) break;
        const take = Math.min(left, load.remainingCents);
        allocations.push({ load, cents: take });
        left -= take;
      }

      const isSplit = allocations.length > 1 || allocations[0]?.load.id !== id;
      const allocationNote = isSplit
        ? `Applied oldest-load-first: ${allocations
            .map((a) => `${a.load.transactionCode} GHS ${fromCents(a.cents).toFixed(2)}`)
            .join(', ')}`
        : null;

      const now = new Date();
      const created: Array<{ subPaymentId: string; transactionId: string; transactionCode: string; ghsAmount: number; remaining: number; isFullyPaid: boolean }> = [];
      let primary: Awaited<ReturnType<typeof tx.subPayment.create>> | null = null;

      for (const { load, cents } of allocations) {
        const sliceGHS = fromCents(cents);
        const remainingAfterCents = load.remainingCents - cents;
        const loadFullyPaid = remainingAfterCents <= 0;

        await ledgerService.recordDisbursement(
          load.id,
          tellerId,
          sliceGHS,
          tellerId,
          tx,
          payoutDetails.receivingMode,
          load.receivingPointId,
          load.transactionCode,
          load.codeType as 'STANDARD' | 'ADDITIONAL'
        );

        const sp = await tx.subPayment.create({
          data: {
            transactionId: load.id,
            ghsAmount: sliceGHS,
            notes: [notes, allocationNote].filter(Boolean).join(' | ') || null,
            receiverName,
            receiverPhone,
            receivingMode: payoutDetails.receivingMode,
            bankName: payoutDetails.bankName,
            bankAccountNo: payoutDetails.bankAccountNo,
            bankAccountName: payoutDetails.bankAccountName,
            cashPhoneNumber: payoutDetails.cashPhoneNumber,
            cashGhanaCardNumber: payoutDetails.cashGhanaCardNumber,
            momoNumber: payoutDetails.momoNumber,
            momoName: payoutDetails.momoName,
            remainingBalance: fromCents(remainingAfterCents),
            paidById: tellerId,
            paidByName: tellerName,
            receivingPointId: load.receivingPointId,
          },
        });
        primary = primary ?? sp;

        await tx.transaction.update({
          where: { id: load.id },
          data: {
            status: loadFullyPaid ? 'PAID' : 'PARTIAL_PAYMENT',
            // Only set completion fields when fully paid so in-progress
            // partials never overwrite values set by a prior step.
            ...(loadFullyPaid ? { paidAt: now, paidBy: tellerId, paidByName: tellerName } : {}),
            ...payoutDetails,
          },
        });

        created.push({
          subPaymentId: sp.id,
          transactionId: load.id,
          transactionCode: load.transactionCode,
          ghsAmount: sliceGHS,
          remaining: fromCents(remainingAfterCents),
          isFullyPaid: loadFullyPaid,
        });
      }

      const targetLoad = loads.find((l) => l.id === id);
      const targetSlice = allocations.find((a) => a.load.id === id)?.cents ?? 0;
      const targetDisbursedCents = (targetLoad?.disbursedCents ?? 0) + targetSlice;
      const targetRemainingCents = Math.max(0, (targetLoad?.remainingCents ?? 0) - targetSlice);
      const senderRemainingAfterCents = senderRemainingCents - requestedCents;

      result = {
        allocations: created,
        totalDisbursed: fromCents(targetDisbursedCents),
        remaining: fromCents(targetRemainingCents),
        isFullyPaid: targetRemainingCents <= 0,
        senderRemaining: fromCents(senderRemainingAfterCents),
        senderFullyPaid: senderRemainingAfterCents <= 0,
      };

      return primary!;
    });

    void prisma.auditLog.create({
      data: {
        userId: tellerId,
        userName: tellerName,
        action: 'SUB_PAYMENT_DISBURSED',
        entity: 'Transaction',
        entityId: id,
        changes: JSON.parse(JSON.stringify({
          subPaymentId: subPayment.id,
          ghsAmount,
          allocations: result.allocations,
          totalDisbursed: result.totalDisbursed,
          isFullyPaid: result.isFullyPaid,
          senderRemaining: result.senderRemaining,
          receiverName,
          receiverPhone,
          receivingMode: payoutDetails.receivingMode,
        })),
      },
    });

    const splitMsg =
      result.allocations.length > 1 || result.allocations[0]?.transactionId !== id
        ? ` Applied to: ${result.allocations.map((a) => `${a.transactionCode} (GHS ${a.ghsAmount.toFixed(2)})`).join(', ')}.`
        : '';

    return successResponse(
      { subPayment, ...result },
      result.senderFullyPaid
        ? `All open loads for this sender fully disbursed.${splitMsg}`
        : `Sub-payment recorded. GHS ${result.senderRemaining.toFixed(2)} remaining for this sender.${splitMsg}`
    );
  } catch (error) {
    console.error('Sub-payment error:', error);
    if (typeof error === 'object' && error && 'issues' in error) {
      const issues = (error as { issues: Array<{ message: string }> }).issues;
      return errorResponse(issues[0]?.message ?? 'Validation failed', 422);
    }
    const message = error instanceof Error ? error.message : 'Failed to record sub-payment';
    return errorResponse(message);
  }
}

// GET /api/transactions/[id]/sub-payments — list sub-payments for a transaction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const check = await requirePermission(request, 'MARK_PAID');
    if (check.denied) return check.response;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: {
        id: true,
        transactionCode: true,
        ghsAmount: true,
        status: true,
        receivingPointId: true,
        receivingMode: true,
        senderId: true,
        codeType: true,
      },
    });

    if (!transaction) return errorResponse('Transaction not found', 404);
    const accessError = ensureReceivingPointAccess(
      request,
      transaction.receivingPointId,
      'Cannot view sub-payments for another receiving point'
    );
    if (accessError) return accessError;

    const subPayments = await prisma.subPayment.findMany({
      where: { transactionId: id },
      orderBy: { paidAt: 'asc' },
    });

    const totalDisbursed = subPayments.reduce((s, sp) => s + Number(sp.ghsAmount), 0);
    const remaining = Number(transaction.ghsAmount) - totalDisbursed;

    // Every open load for the same sender at this branch/code type — payouts
    // are applied to these oldest-first (see POST).
    const open = await prisma.transaction.findMany({
      where: {
        senderId: transaction.senderId,
        receivingPointId: transaction.receivingPointId,
        codeType: transaction.codeType,
        status: { in: ['SYNCED', 'PARTIAL_PAYMENT'] },
      },
      select: { id: true, transactionCode: true, ghsAmount: true, status: true, transactionDate: true, createdAt: true },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const openSums = await prisma.subPayment.groupBy({
      by: ['transactionId'],
      where: { transactionId: { in: open.map((o) => o.id) } },
      _sum: { ghsAmount: true },
    });
    const openDisbursed = new Map(openSums.map((s) => [s.transactionId, toCents(s._sum.ghsAmount)]));
    const openLoads = open
      .map((o) => {
        const totalCents = toCents(o.ghsAmount);
        const disbursedCents = openDisbursed.get(o.id) ?? 0;
        return {
          id: o.id,
          transactionCode: o.transactionCode,
          status: o.status,
          transactionDate: o.transactionDate,
          ghsAmount: fromCents(totalCents),
          disbursed: fromCents(disbursedCents),
          remaining: fromCents(Math.max(0, totalCents - disbursedCents)),
        };
      })
      .filter((o) => o.remaining > 0);
    const senderRemaining = fromCents(openLoads.reduce((s, o) => s + toCents(o.remaining), 0));

    return successResponse({
      transaction,
      subPayments,
      totalDisbursed,
      remaining: Math.max(0, remaining),
      openLoads,
      senderRemaining,
    });
  } catch (error) {
    console.error('Get sub-payments error:', error);
    return errorResponse('Failed to fetch sub-payments');
  }
}
