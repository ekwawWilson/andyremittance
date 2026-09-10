/**
 * POST /api/change-requests/[id]/approve
 *
 * Carries out what the request asked for — this is the only place the ledger
 * moves. The service refuses if the approver is the person who raised it.
 */

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
      'You can only approve requests for your own branch.'
    );
    if (scopeError) return scopeError;

    const body = await request.json().catch(() => ({}));
    const actor = await prisma.user.findUnique({
      where: { id: check.ctx.userId },
      select: { firstName: true, lastName: true },
    });

    const result = await service.approve({
      requestId: id,
      note: typeof body?.note === 'string' ? body.note : undefined,
      actor: {
        userId: check.ctx.userId,
        userName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : check.ctx.userEmail,
        userRole: check.ctx.userRole,
      },
      ipAddress:
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    });

    return successResponse(result, result.outcome);
  } catch (error) {
    console.error('Approve change request error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to approve the request');
  }
}
