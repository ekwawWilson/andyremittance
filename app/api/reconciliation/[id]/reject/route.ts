import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureReceivingPointAccess, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const rejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

function getBusinessDayWindow(date: Date) {
  const businessDate = new Date(date);
  businessDate.setUTCHours(0, 0, 0, 0);
  const nextDay = new Date(businessDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return { businessDate, nextDay };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'APPROVE_RECONCILIATION');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const { id } = await params;

    const recon = await prisma.tellerReconciliation.findUnique({ where: { id } });
    if (!recon) return errorResponse('Reconciliation not found', 404);
    const accessError = ensureReceivingPointAccess(
      request,
      recon.receivingPointId,
      'Cannot reject reconciliation for another receiving point'
    );
    if (accessError) return accessError;
    const body = await request.json();
    const { reason } = rejectSchema.parse(body);
    const { businessDate, nextDay } = getBusinessDayWindow(recon.reconciliationDate);

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.tellerReconciliation.findUnique({
        where: { id },
        select: {
          id: true,
          tellerId: true,
          status: true,
        },
      });
      if (!current) {
        throw new Error('Reconciliation not found');
      }
      if (current.status !== 'PENDING') {
        throw new Error(`Reconciliation is already ${current.status.toLowerCase()}`);
      }

      const latestForDay = await tx.tellerReconciliation.findFirst({
        where: {
          tellerId: current.tellerId,
          reconciliationDate: { gte: businessDate, lt: nextDay },
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        select: { id: true },
      });

      if (!latestForDay || latestForDay.id !== id) {
        const staleError = new Error(
          'A newer reconciliation submission exists for this teller and day. Reject the latest submission instead.'
        ) as Error & { status?: number };
        staleError.status = 409;
        throw staleError;
      }

      return tx.tellerReconciliation.update({
        where: { id },
        data: {
          status: 'REJECTED',
          notes: recon.notes ? `${recon.notes}\n[REJECTED: ${reason}]` : `[REJECTED: ${reason}]`,
          approvedBy: userId,
          approvedAt: new Date(),
        },
        include: {
          teller: { select: { firstName: true, lastName: true } },
          receivingPoint: { select: { name: true, code: true } },
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'REJECT_RECONCILIATION',
        entity: 'TellerReconciliation',
        entityId: id,
        changes: JSON.parse(JSON.stringify({ reason })),
      },
    });

    return successResponse(updated, 'Reconciliation rejected');
  } catch (error) {
    console.error('Reject reconciliation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to reject reconciliation';
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 400;
    return errorResponse(message, status || 400);
  }
}
