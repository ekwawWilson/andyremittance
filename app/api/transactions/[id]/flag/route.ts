import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { ensureReceivingPointAccess } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { TransactionStatus } from '@prisma/client';
import { z } from 'zod';

const flagSchema = z.object({
  action: z.enum(['VOID', 'FLAGGED', 'RESTORE']),
  reason: z.string().trim().min(1, 'Reason / remarks is required').max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const check = await requirePermission(request, 'FLAG_TRANSACTION');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (!user) return errorResponse('User not found', 404);
    const actorName = `${user.firstName} ${user.lastName}`;

    const body = await request.json();
    const parsed = flagSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Validation failed', 422);
    }
    const { action, reason } = parsed.data;

    const locked = await prisma.$queryRaw<Array<{
      id: string;
      status: TransactionStatus;
      receivingPointId: string;
      transactionCode: string;
      flaggedFromStatus: TransactionStatus | null;
      flagReason: string | null;
    }>>`
      SELECT id, status, "receivingPointId", "transactionCode",
             "flaggedFromStatus", "flagReason"
      FROM "Transaction"
      WHERE id = ${id}
    `;

    const transaction = locked[0];
    if (!transaction) return errorResponse('Transaction not found', 404);

    const accessError = ensureReceivingPointAccess(
      request,
      transaction.receivingPointId,
      'Cannot flag transactions for another receiving point'
    );
    if (accessError) return accessError;

    const isSoftFlaggedPaid =
      transaction.status === 'PAID' &&
      transaction.flaggedFromStatus === 'PAID' &&
      !!transaction.flagReason;

    if (action === 'VOID') {
      return errorResponse(
        'Receiving portal voiding is disabled because it would bypass sender, vault, and payout reversals. Flag the transaction and resolve the underlying issue first.',
        400
      );
    }

    if (action === 'FLAGGED') {
      if (transaction.status === 'FLAGGED' || isSoftFlaggedPaid) {
        return errorResponse('Transaction is already flagged.', 400);
      }
      if (!['SYNCED', 'PARTIAL_PAYMENT', 'PAID'].includes(transaction.status)) {
        return errorResponse(
          'Only synced, partial-payment, or paid transactions can be flagged from the receiving portal.',
          400
        );
      }
    }

    if (action === 'RESTORE') {
      if (transaction.status === 'VOID') {
        return errorResponse(
          'Legacy voided transactions cannot be restored automatically from the receiving portal.',
          400
        );
      }
      if (transaction.status === 'FLAGGED' && !transaction.flaggedFromStatus) {
        return errorResponse('This flagged transaction is missing its previous status and cannot be restored automatically.', 400);
      }
      if (transaction.status !== 'FLAGGED' && !isSoftFlaggedPaid) {
        return errorResponse('Only flagged transactions can be restored.', 400);
      }
    }

    const restoreStatus: TransactionStatus | null = isSoftFlaggedPaid
      ? 'PAID'
      : transaction.flaggedFromStatus;
    const newStatus: TransactionStatus =
      action === 'RESTORE'
        ? restoreStatus ?? transaction.status
        : transaction.status === 'PAID'
          ? 'PAID'
          : 'FLAGGED';

    await prisma.$executeRaw`
      UPDATE "Transaction"
      SET status = ${newStatus}::"TransactionStatus",
          "flaggedFromStatus" = ${action === 'RESTORE' ? null : transaction.status}::"TransactionStatus",
          "flagReason" = ${action === 'RESTORE' ? null : reason},
          "flaggedAt" = ${action === 'RESTORE' ? null : new Date()},
          "flaggedById" = ${action === 'RESTORE' ? null : userId},
          "flaggedByName" = ${action === 'RESTORE' ? null : actorName}
      WHERE id = ${id}
    `;

    const updated = await prisma.transaction.findUnique({
      where: { id },
      include: { sender: true, receiver: true, receivingPoint: true },
    });
    if (!updated) return errorResponse('Transaction not found', 404);

    void prisma.auditLog.create({
      data: {
        userId,
        userName: actorName,
        action: action === 'RESTORE' ? 'TRANSACTION_RESTORED' : 'TRANSACTION_FLAGGED',
        entity: 'Transaction',
        entityId: id,
        changes: {
          action,
          reason,
          transactionCode: transaction.transactionCode,
          previousStatus: transaction.status,
          restoredStatus: action === 'RESTORE' ? restoreStatus : null,
        },
      },
    });

    const label =
      action === 'RESTORE'
        ? 'restored'
        : transaction.status === 'PAID'
          ? 'flagged with issue'
          : 'flagged and held';
    return successResponse(updated, `Transaction ${label} successfully`);
  } catch (error) {
    console.error('Flag transaction error:', error);
    if (typeof error === 'object' && error && 'issues' in error) {
      const issues = (error as { issues: Array<{ message: string }> }).issues;
      return errorResponse(issues[0]?.message ?? 'Validation failed', 422);
    }
    const message = error instanceof Error ? error.message : 'Failed to update transaction';
    return errorResponse(message);
  }
}
