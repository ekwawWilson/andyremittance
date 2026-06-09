import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { TransactionService } from '@/lib/services/transaction.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const bulkSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(50),
});

const transactionService = new TransactionService();

// POST /api/transactions/bulk-disburse
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MARK_PAID');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (!user) return errorResponse('User not found', 404);
    const tellerName = `${user.firstName} ${user.lastName}`;

    const body = await request.json();
    const { transactionIds } = bulkSchema.parse(body);

    // Guard: reject any multi-receiver transactions upfront — they require the
    // dedicated /multi-receiver/disburse flow and cannot be bulk-disbursed.
    const multiReceiverTxs = await prisma.transaction.findMany({
      where: {
        id: { in: transactionIds },
        OR: [
          { receiversDeferred: true },
          { transactionReceivers: { some: {} } },
        ],
      },
      select: { id: true },
    });

    const blockedIds = new Set(multiReceiverTxs.map((t) => t.id));
    const eligibleIds = transactionIds.filter((id) => !blockedIds.has(id));

    // Run all disbursements in parallel. Each markAsPaid is internally atomic.
    // A failure in one does not block the others.
    const settled = await Promise.allSettled(
      eligibleIds.map((id) =>
        transactionService.markAsPaid(id, userId, tellerName, receivingPointId)
      )
    );

    const succeededIds: string[] = [];
    const failedItems: Array<{ id: string; error: string }> = [];

    settled.forEach((result, idx) => {
      const id = eligibleIds[idx];
      if (result.status === 'fulfilled') {
        succeededIds.push(id);
      } else {
        failedItems.push({
          id,
          error: result.reason instanceof Error ? result.reason.message : 'Failed',
        });
      }
    });

    // Add blocked multi-receiver transactions as explicit failures
    blockedIds.forEach((id) => {
      failedItems.push({ id, error: 'Multi-receiver — use Multi-Disburse action' });
    });

    // Write all audit entries in a single batch instead of N round-trips
    if (succeededIds.length > 0) {
      await prisma.auditLog.createMany({
        data: succeededIds.map((id) => ({
          userId,
          userName: tellerName,
          action: 'MARK_TRANSACTION_PAID',
          entity: 'Transaction',
          entityId: id,
        })),
      });
    }

    const results = [
      ...succeededIds.map((id) => ({ id, success: true })),
      ...failedItems.map(({ id, error }) => ({ id, success: false, error })),
    ];

    const succeeded = succeededIds.length;
    const failed = failedItems.length;

    return successResponse(
      { results, succeeded, failed },
      `${succeeded} transaction${succeeded !== 1 ? 's' : ''} disbursed${failed > 0 ? `, ${failed} failed` : ''}`
    );
  } catch (error) {
    console.error('Bulk disburse error:', error);
    const message = error instanceof Error ? error.message : 'Bulk disburse failed';
    return errorResponse(message);
  }
}
