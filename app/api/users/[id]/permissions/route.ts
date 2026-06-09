import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, getMergedPermissions } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { ROLE_DEFAULTS } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

// Roles that only SUPER_ADMIN may manage permissions for
const ELEVATED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'];

// GET /api/users/:id/permissions
// Returns merged permissions (role defaults + custom grants) for the user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'GRANT_PERMISSIONS');
    if (check.denied) return check.response;

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!user) return errorResponse('User not found', 404);

    // Only SUPER_ADMIN can view/manage permissions for elevated roles
    if (ELEVATED_ROLES.includes(user.role) && check.ctx.userRole !== 'SUPER_ADMIN') {
      return errorResponse('Only Super Admin can manage permissions for Admin-level users', 403);
    }

    // Get only the custom (non-role-default) permissions
    const customPerms = await prisma.permission.findMany({
      where: { userId: id },
      select: { key: true },
    });

    return successResponse({
      permissions: customPerms.map((p) => p.key),
    });
  } catch (error) {
    console.error('Get user permissions error:', error);
    return errorResponse('Failed to get permissions');
  }
}

// PUT /api/users/:id/permissions
// Sets the user's custom permissions (non-role-default grants)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'GRANT_PERMISSIONS');
    if (check.denied) return check.response;

    const { id } = await params;
    const { permissions } = await request.json();

    if (!Array.isArray(permissions)) {
      return errorResponse('permissions must be an array');
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!user) return errorResponse('User not found', 404);

    // Only SUPER_ADMIN can modify permissions for elevated roles
    if (ELEVATED_ROLES.includes(user.role) && check.ctx.userRole !== 'SUPER_ADMIN') {
      return errorResponse('Only Super Admin can manage permissions for Admin-level users', 403);
    }

    // Get role defaults for this user
    const roleDefaults = ROLE_DEFAULTS[user.role] ?? [];

    // Filter out role defaults - we only store custom grants
    const customPerms = permissions.filter((key: string) => !roleDefaults.includes(key));

    // Delete all existing custom permissions for this user
    await prisma.permission.deleteMany({
      where: { userId: id },
    });

    // Create new custom permissions
    if (customPerms.length > 0) {
      await prisma.permission.createMany({
        data: customPerms.map((key: string) => ({
          userId: id,
          key,
          grantedBy: check.ctx.userId,
        })),
      });
    }

    return successResponse({
      permissions: customPerms,
    });
  } catch (error) {
    console.error('Update user permissions error:', error);
    return errorResponse('Failed to update permissions');
  }
}
