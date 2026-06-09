import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureReceivingPointAccess, requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';
import { normalizeDisbursementDetails, partialDisbursementSchema } from '@/lib/validators/disbursement';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

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
    // SELECT FOR UPDATE on the transaction row serialises concurrent sub-payment
    // requests so two simultaneous clicks cannot both read the same remaining
    // balance, both pass the check, and both commit — overdrawing the total.
    let totalGHS = 0;
    let newDisbursed = 0;
    let isFullyPaid = false;

    const subPayment = await prisma.$transaction(async (tx) => {
      // Lock the transaction row for the duration of this write
      const locked = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        ghsAmount: string;
        receivingPointId: string;
        receivingMode: string;
        codeType: string;
        transactionCode: string;
      }>>`
        SELECT id, status, "ghsAmount", "receivingPointId", "receivingMode",
               "codeType", "transactionCode"
        FROM "Transaction"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const row = locked[0];
      if (!row) throw new Error('Transaction not found');
      if (!['SYNCED', 'PARTIAL_PAYMENT'].includes(row.status)) {
        throw new Error('Transaction must be SYNCED to record sub-payments');
      }

      // Re-sum sub-payments inside the lock so two concurrent requests see different totals
      const existingSubPayments = await tx.subPayment.findMany({
        where: { transactionId: id },
        select: { ghsAmount: true },
      });

      totalGHS = Number(row.ghsAmount);
      const alreadyDisbursed = existingSubPayments.reduce((s, sp) => s + Number(sp.ghsAmount), 0);
      const remaining = totalGHS - alreadyDisbursed;

      if (ghsAmount > remaining + 0.001) {
        throw new Error(`Amount exceeds remaining balance. Remaining: GHS ${remaining.toFixed(2)}`);
      }

      newDisbursed = alreadyDisbursed + ghsAmount;
      isFullyPaid = newDisbursed >= totalGHS - 0.001;

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
          totalDisbursed: newDisbursed,
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
        totalDisbursed: newDisbursed,
        remaining: isFullyPaid ? 0 : totalGHS - newDisbursed,
        isFullyPaid,
      },
      isFullyPaid
        ? 'Transaction fully disbursed'
        : `Sub-payment recorded. GHS ${(totalGHS - newDisbursed).toFixed(2)} remaining.`
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

    return successResponse({
      transaction,
      subPayments,
      totalDisbursed,
      remaining: Math.max(0, remaining),
    });
  } catch (error) {
    console.error('Get sub-payments error:', error);
    return errorResponse('Failed to fetch sub-payments');
  }
}
