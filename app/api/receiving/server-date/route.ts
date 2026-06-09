import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RECEIVING_ADMIN'];

// GET /api/receiving/server-date?receivingPointId=<id>
// Returns the branch server date (or all branches for super admin)
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    if (!userId || !userRole) return errorResponse('Unauthorised', 401);

    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(
      request,
      searchParams.get('receivingPointId')
    );

    if (receivingPointId) {
      const branch = await prisma.receivingPoint.findUnique({
        where: { id: receivingPointId },
        select: { id: true, name: true, code: true, serverDate: true },
      });
      if (!branch) return errorResponse('Branch not found', 404);
      return successResponse({
        receivingPointId: branch.id,
        name: branch.name,
        code: branch.code,
        serverDate: branch.serverDate.toISOString().split('T')[0],
      });
    }

    // No branch scoped — return all branches (admins only)
    const branches = await prisma.receivingPoint.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, serverDate: true },
      orderBy: { name: 'asc' },
    });
    return successResponse(
      branches.map((b) => ({
        receivingPointId: b.id,
        name: b.name,
        code: b.code,
        serverDate: b.serverDate.toISOString().split('T')[0],
      }))
    );
  } catch (error) {
    console.error('Get receiving server date error:', error);
    return errorResponse('Failed to get receiving server date');
  }
}

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  receivingPointId: z.string().uuid().optional().nullable(),
});

// PATCH /api/receiving/server-date — manually override a branch server date (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'RECEIVING_EOD');
    if (check.denied) return check.response;

    const { userId, userRole } = check.ctx;
    if (!ADMIN_ROLES.includes(userRole)) {
      return errorResponse('Only a Receiving Admin can update the branch server date', 403);
    }

    const body = await request.json();
    const { date, receivingPointId: requestedId } = updateSchema.parse(body);
    const receivingPointId = getScopedReceivingPointId(request, requestedId ?? null);

    if (!receivingPointId) {
      return errorResponse('A branch must be specified', 400);
    }

    const newDate = new Date(date + 'T00:00:00.000Z');

    const branch = await prisma.receivingPoint.update({
      where: { id: receivingPointId },
      data: { serverDate: newDate },
      select: { id: true, name: true, code: true, serverDate: true },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE_RECEIVING_SERVER_DATE',
        entity: 'ReceivingPoint',
        entityId: receivingPointId,
        changes: { serverDate: date } as Record<string, string>,
      },
    });

    return successResponse({
      receivingPointId: branch.id,
      name: branch.name,
      code: branch.code,
      serverDate: branch.serverDate.toISOString().split('T')[0],
    }, 'Branch server date updated');
  } catch (error) {
    console.error('Update receiving server date error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update branch server date';
    return errorResponse(message);
  }
}
