import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// POST /api/accounting/period/[id]/close
// Close (or lock) an accounting period. Closing prevents new journal entries.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'MANAGE_LEDGER_ACCOUNTS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const { id } = await params;
    const body   = await request.json().catch(() => ({}));
    const action = body.action === 'LOCK' ? 'LOCKED' : 'CLOSED';

    const period = await prisma.accountingPeriod.findUnique({ where: { id } });
    if (!period) return errorResponse('Period not found', 404);
    if (period.status === 'LOCKED') return errorResponse('Period is already locked', 400);
    if (action === 'CLOSED' && period.status === 'CLOSED') return errorResponse('Period is already closed', 400);

    // For LOCK, user must be SUPER_ADMIN or ADMIN
    if (action === 'LOCKED' && !['SUPER_ADMIN', 'ADMIN'].includes(check.ctx.userRole)) {
      return errorResponse('Only SUPER_ADMIN or ADMIN can lock a period', 403);
    }

    const updated = await prisma.accountingPeriod.update({
      where: { id },
      data: {
        status:    action as 'CLOSED' | 'LOCKED',
        closedById: userId,
        closedAt:   new Date(),
      },
      include: {
        receivingPoint: { select: { name: true, code: true } },
        closedBy:       { select: { firstName: true, lastName: true } },
      },
    });

    void prisma.auditLog.create({
      data: {
        userId,
        action: `PERIOD_${action}`,
        entity: 'AccountingPeriod',
        entityId: id,
        changes: JSON.parse(JSON.stringify({ status: action, periodYear: period.periodYear, periodMonth: period.periodMonth })),
      },
    }).catch((e) => console.error('Audit log error:', e));

    return successResponse(updated, `Period ${action.toLowerCase()}`);
  } catch (error) {
    console.error('Close period error:', error);
    return errorResponse('Failed to close period');
  }
}
