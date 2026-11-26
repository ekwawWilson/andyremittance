import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureReceivingPointAccess, requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';
import { normalizeDisbursementDetails, partialDisbursementSchema } from '@/lib/validators/disbursement';
import { payableGHS } from '@/lib/services/carry-forward.service';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

// Work in integer pesewas to avoid float drift leaving 0.01 fragments behind.
const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const fromCents = (c: number) => c / 100;

// POST /api/transactions/[id]/sub-payments — record a partial disbursement
//
// The payment is recorded only on this transfer. Its payable amount includes any
// balance carried in from the sender's older transfers (see carry-forward.service):
//   payable = ghsAmount + carriedInGHS - carriedOutGHS
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
    // SELECT FOR UPDATE on the transaction row serialises concurrent sub-payment
    // requests so two simultaneous clicks cannot both read the same remaining
    // balance, both pass the check, and both commit — overdrawing the total.
    let totalGHS = 0;
    let newDisbursedCents = 0;
    let remainingCents = 0;
    let isFullyPaid = false;

    const subPayment = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        ghsAmount: string;
        carriedInGHS: string;
        carriedOutGHS: string;
        receivingPointId: string;
        receivingMode: string;
        codeType: string;
        transactionCode: string;
      }>>`
        SELECT id, status, "ghsAmount", "carriedInGHS", "carriedOutGHS",
               "receivingPointId", "receivingMode", "codeType", "transactionCode"
        FROM "Transaction"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const row = locked[0];
      if (!row) throw new Error('Transaction not found');
      if (!['SYNCED', 'PARTIAL_PAYMENT'].includes(row.status)) {
        throw new Error('Transaction must be SYNCED to record sub-payments');
      }

      // Re-sum sub-payments inside the lock so concurrent requests see fresh totals
      const agg = await tx.subPayment.aggregate({
        where: { transactionId: id },
        _sum: { ghsAmount: true },
      });

      const payableCents = toCents(payableGHS(row));
      const alreadyCents = toCents(agg._sum.ghsAmount);
      const availableCents = payableCents - alreadyCents;
      const requestedCents = Math.round(ghsAmount * 100);

      if (requestedCents > availableCents) {
        throw new Error(`Amount exceeds remaining balance. Remaining: GHS ${fromCents(availableCents).toFixed(2)}`);
      }

      totalGHS = fromCents(payableCents);
      newDisbursedCents = alreadyCents + requestedCents;
      remainingCents = payableCents - newDisbursedCents;
      isFullyPaid = remainingCents <= 0;

      await ledgerService.recordDisbursement(
        id,
        tellerId,
        ghsAmount,
        tellerId,
        tx,
        payoutDetails.receivingMode,
        row.receivingPointId,
        row.transactionCode,
        row.codeType as 'STANDARD' | 'ADDITIONAL'
      );

      const sp = await tx.subPayment.create({
        data: {
          transactionId: id,
          ghsAmount,
          notes,
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
          remainingBalance: fromCents(remainingCents),
          paidById: tellerId,
          paidByName: tellerName,
          receivingPointId: row.receivingPointId,
        },
      });

      await tx.transaction.update({
        where: { id },
        data: {
          status: isFullyPaid ? 'PAID' : 'PARTIAL_PAYMENT',
          // Only set completion fields when fully paid; use undefined (not null)
          // so in-progress partials never overwrite values set by a prior step.
          ...(isFullyPaid
            ? { paidAt: new Date(), paidBy: tellerId, paidByName: tellerName }
            : {}),
          ...payoutDetails,
        },
      });

      return sp;
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
          totalDisbursed: fromCents(newDisbursedCents),
          totalGHS,
          isFullyPaid,
          receiverName,
          receiverPhone,
          receivingMode: payoutDetails.receivingMode,
        })),
      },
    });

    return successResponse(
      {
        subPayment,
        totalDisbursed: fromCents(newDisbursedCents),
        remaining: isFullyPaid ? 0 : fromCents(remainingCents),
        isFullyPaid,
      },
      isFullyPaid
        ? 'Transaction fully disbursed'
        : `Sub-payment recorded. GHS ${fromCents(remainingCents).toFixed(2)} remaining.`
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

// GET /api/transactions/[id]/sub-payments — list sub-payments for a transaction,
// plus the sender's earlier transfers whose balances were carried into it.
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
        carriedInGHS: true,
        carriedOutGHS: true,
        status: true,
        receivingPointId: true,
        receivingMode: true,
        transactionDate: true,
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

    const totalDisbursed = fromCents(subPayments.reduce((s, sp) => s + toCents(sp.ghsAmount), 0));
    const payable = payableGHS(transaction);
    const remaining = fromCents(toCents(payable) - toCents(totalDisbursed));

    // Earlier transfers whose balance was carried into this one — walk the chain
    // back (each of those may itself have received a balance from an older one).
    type Carried = {
      id: string;
      transactionCode: string;
      transactionDate: Date;
      ghsAmount: number;
      carriedInGHS: number;
      disbursed: number;
      carriedForward: number;
      subPayments: typeof subPayments;
    };
    const carriedFrom: Carried[] = [];
    let frontier = [id];
    for (let depth = 0; depth < 24 && frontier.length > 0; depth++) {
      const sources = await prisma.transaction.findMany({
        where: { carriedForwardToId: { in: frontier } },
        select: {
          id: true,
          transactionCode: true,
          transactionDate: true,
          ghsAmount: true,
          carriedInGHS: true,
          carriedOutGHS: true,
          subPayments: { orderBy: { paidAt: 'asc' } },
        },
      });
      for (const s of sources) {
        carriedFrom.push({
          id: s.id,
          transactionCode: s.transactionCode,
          transactionDate: s.transactionDate,
          ghsAmount: Number(s.ghsAmount),
          carriedInGHS: Number(s.carriedInGHS),
          disbursed: fromCents(s.subPayments.reduce((a, sp) => a + toCents(sp.ghsAmount), 0)),
          carriedForward: Number(s.carriedOutGHS),
          subPayments: s.subPayments,
        });
      }
      frontier = sources.map((s) => s.id);
    }
    carriedFrom.sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
    );

    return successResponse({
      transaction,
      subPayments,
      totalDisbursed,
      payable,
      remaining: Math.max(0, remaining),
      carriedFrom,
    });
  } catch (error) {
    console.error('Get sub-payments error:', error);
    return errorResponse('Failed to fetch sub-payments');
  }
}
