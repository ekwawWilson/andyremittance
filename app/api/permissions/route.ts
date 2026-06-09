import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import prisma from '@/lib/db/prisma';
import { ALL_PERMISSION_KEYS, roleHasPermission } from '@/lib/auth/roles';
import { requirePermission } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

const grantSchema = z.object({
  userId: z.string().uuid(),
  key: z.string(),
});

// GET /api/permissions?userId=...
// Returns per-user Permission rows (extras beyond role defaults).
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'GRANT_PERMISSIONS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const permissions = await prisma.permission.findMany({
      where: userId ? { userId } : {},
      include: {
        user: { select: { firstName: true, lastName: true, email: true, role: true } },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return successResponse(permissions);
  } catch (error) {
    console.error('Get permissions error:', error);
    return errorResponse('Failed to fetch permissions');
  }
}

// POST /api/permissions  { userId, key }
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'GRANT_PERMISSIONS');
    if (check.denied) return check.response;

    const body = await request.json();
    const { userId, key } = grantSchema.parse(body);

    if (!ALL_PERMISSION_KEYS.includes(key as typeof ALL_PERMISSION_KEYS[number])) {
      return errorResponse('Invalid permission key', 400);
    }

    // Look up target user's role to check if the permission is already a role default
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!targetUser) return errorResponse('Target user not found', 404);

    if (roleHasPermission(targetUser.role, key)) {
      return errorResponse(
        `Permission ${key} is already included in the ${targetUser.role} role`,
        400
      );
    }

    const permission = await prisma.permission.create({
      data: { userId, key, grantedBy: check.ctx.userId },
    });

    await prisma.auditLog.create({
      data: {
        userId: check.ctx.userId,
        action: 'GRANT_PERMISSION',
        entity: 'Permission',
        entityId: permission.id,
        changes: { targetUserId: userId, key },
      },
    });

    return successResponse(permission, 'Permission granted');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return errorResponse('User already has this permission', 400);
    }
    console.error('Grant permission error:', error);
    return errorResponse('Failed to grant permission');
  }
}

// DELETE /api/permissions  { userId, key }
export async function DELETE(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'GRANT_PERMISSIONS');
    if (check.denied) return check.response;

    const body = await request.json();
    const { userId, key } = grantSchema.parse(body);

    // Cannot revoke a role-default permission (no row exists for it)
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!targetUser) return errorResponse('Target user not found', 404);

    if (roleHasPermission(targetUser.role, key)) {
      return errorResponse(
        `Permission ${key} is a default for the ${targetUser.role} role and cannot be individually revoked`,
        400
      );
    }

    const deleted = await prisma.permission.deleteMany({
      where: { userId, key },
    });

    if (deleted.count === 0) {
      return errorResponse('Permission not found', 404);
    }

    await prisma.auditLog.create({
      data: {
        userId: check.ctx.userId,
        action: 'REVOKE_PERMISSION',
        entity: 'Permission',
        changes: { targetUserId: userId, key },
      },
    });

    return successResponse(null, 'Permission revoked');
  } catch (error) {
    console.error('Revoke permission error:', error);
    return errorResponse('Failed to revoke permission');
  }
}
