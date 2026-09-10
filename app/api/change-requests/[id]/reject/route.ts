/** POST /api/change-requests/[id]/reject — decline a request; nothing changes. */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, ensureReceivingPointAccess } from '@/lib/auth/permissions';
import { ChangeRequestService } from '@/lib/services/change-request.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const service = new ChangeRequestService();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await requirePermission(request, 'APPROVE_TRANSACTION_CHANGE');
    if (check.denied) return check.response;

    const { id } = await params;

    const existing = await prisma.transactionChangeRequest.findUnique({
      where: { id },
      select: { receivingPointId: true },
    });
    if (!existing) return errorResponse('Request not found', 404);

    const scopeError = ensureReceivingPointAccess(
      request,
      existing.receivingPointId,
      'You can only review requests for your own branch.'
    );
    if (scopeError) return scopeError;

    const body = await request.json().catch(() => ({}));
    const actor = await prisma.user.findUnique({
      where: { id: check.ctx.userId },
      select: { firstName: true, lastName: true },
    });

    const rejected = await service.reject({
      requestId: id,
      note: typeof body?.note === 'string' ? body.note : '',
      actor: {
        userId: check.ctx.userId,
        userName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : check.ctx.userEmail,
        userRole: check.ctx.userRole,
      },
    });

    return successResponse(rejected, 'Request rejected.');
  } catch (error) {
    console.error('Reject change request error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to reject the request');
  }
}
