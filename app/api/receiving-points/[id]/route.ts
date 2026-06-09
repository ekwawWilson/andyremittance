import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// PATCH /api/receiving-points/:id
// Requires MANAGE_RECEIVING_POINTS permission
// Allowed fields: name, address, city, country, phone, isActive
// code is read-only
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'MANAGE_RECEIVING_POINTS');
    if (check.denied) return check.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.receivingPoint.findUnique({ where: { id } });
    if (!existing) return errorResponse('Receiving point not found', 404);

    const allowed = ['name', 'address', 'city', 'country', 'phone', 'isActive'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const updated = await prisma.receivingPoint.update({
      where: { id },
      data: updates,
      include: {
        _count: { select: { transactions: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: check.ctx.userId,
        action: 'UPDATE_RECEIVING_POINT',
        entity: 'ReceivingPoint',
        entityId: id,
        changes: updates as Record<string, string | number | boolean | null>,
      },
    });

    return successResponse(updated, 'Receiving point updated successfully');
  } catch (error) {
    console.error('Update receiving point error:', error);
    return errorResponse('Failed to update receiving point');
  }
}
