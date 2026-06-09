import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'];

// GET /api/server-date — return the sending portal server date
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) return errorResponse('Unauthorised', 401);

    const config = await prisma.systemConfig.findUnique({ where: { key: 'DEFAULT' } });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const serverDate = config?.sendingServerDate ?? today;

    return successResponse({
      serverDate: serverDate.toISOString().split('T')[0],
    });
  } catch (error) {
    console.error('Get server date error:', error);
    return errorResponse('Failed to get server date');
  }
}

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

// PATCH /api/server-date — manually override the sending server date (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'SYNC_TRANSACTIONS');
    if (check.denied) return check.response;

    const { userId, userRole } = check.ctx;
    if (!ADMIN_ROLES.includes(userRole)) {
      return errorResponse('Only a Sending Admin can update the server date', 403);
    }

    const body = await request.json();
    const { date } = updateSchema.parse(body);
    const newDate = new Date(date + 'T00:00:00.000Z');

    const config = await prisma.systemConfig.upsert({
      where: { key: 'DEFAULT' },
      create: { key: 'DEFAULT', sendingServerDate: newDate },
      update: { sendingServerDate: newDate },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE_SENDING_SERVER_DATE',
        entity: 'SystemConfig',
        entityId: 'DEFAULT',
        changes: { sendingServerDate: date } as Record<string, string>,
      },
    });

    return successResponse({
      serverDate: config.sendingServerDate.toISOString().split('T')[0],
    }, 'Sending server date updated');
  } catch (error) {
    console.error('Update server date error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update server date';
    return errorResponse(message);
  }
}
