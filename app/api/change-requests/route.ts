/**
 * /api/change-requests
 *
 * POST — raise a request to reverse, edit or cancel a transaction. Records the
 *        intent only; no money moves until someone approves it.
 * GET  — the approval queue, scoped to the caller's branch.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, getScopedReceivingPointId } from '@/lib/auth/permissions';
import { ChangeRequestService } from '@/lib/services/change-request.service';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const service = new ChangeRequestService();

const raiseSchema = z.object({
  transactionId: z.string().uuid('Invalid transaction'),
  type: z.enum(['DISBURSEMENT_REVERSAL', 'TRANSACTION_EDIT', 'TRANSACTION_CANCEL']),
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters'),
  proposedChanges: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'REQUEST_TRANSACTION_CHANGE');
    if (check.denied) return check.response;

    const input = raiseSchema.parse(await request.json());

    const actor = await prisma.user.findUnique({
      where: { id: check.ctx.userId },
      select: { firstName: true, lastName: true },
    });

    const created = await service.raise({
      ...input,
      actor: {
        userId: check.ctx.userId,
        userName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : check.ctx.userEmail,
      },
    });

    return successResponse(created, 'Request submitted for approval.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((i) => i.message).join('; '));
    }
    console.error('Raise change request error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to raise the request');
  }
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'REQUEST_TRANSACTION_CHANGE');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));

    const where: Prisma.TransactionChangeRequestWhereInput = {
      ...(receivingPointId ? { receivingPointId } : {}),
      ...(status && status !== 'ALL' ? { status: status as never } : {}),
    };

    const requests = await prisma.transactionChangeRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
      take: 200,
      include: {
        transaction: {
          select: {
            id: true, transactionCode: true, status: true, ghsAmount: true, cadAmount: true,
            receivingMode: true, transactionDate: true, paidAt: true, paidByName: true,
            sender: { select: { firstName: true, lastName: true } },
            receiver: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return successResponse(requests);
  } catch (error) {
    console.error('List change requests error:', error);
    return errorResponse('Failed to load change requests');
  }
}
