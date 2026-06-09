import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const rejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'MANAGE_VAULT_TRANSFERS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    const { id } = await params;

    // Pre-flight: parse and validate the body before acquiring any locks
    const body = await request.json();
    const { reason } = rejectSchema.parse(body);

    // Status check and update are atomic — SELECT FOR UPDATE prevents two concurrent
    // reject calls from both reading PENDING and both writing REJECTED.
    const updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        receivingPointId: string | null;
      }>>`
        SELECT id, status, "receivingPointId"
        FROM "CashTransferRequest"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const req = locked[0];
      if (!req) throw new Error('Transfer request not found');
      if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status.toLowerCase()}`);

      if (receivingPointId && req.receivingPointId && req.receivingPointId !== receivingPointId) {
        throw new Error('Not authorised to reject requests from another branch');
      }

      return tx.cashTransferRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          approvedBy: userId,
          approvedAt: new Date(),
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'REJECT_CASH_TRANSFER',
        entity: 'CashTransferRequest',
        entityId: id,
        changes: JSON.parse(JSON.stringify({ reason })),
      },
    });

    return successResponse(updated, 'Transfer request rejected');
  } catch (error) {
    console.error('Reject transfer error:', error);
    const message = error instanceof Error ? error.message : 'Failed to reject transfer';
    const status = message.includes('Not authorised') ? 403
      : message.includes('already') || message.includes('not found') ? 400
      : 500;
    return errorResponse(message, status);
  }
}
