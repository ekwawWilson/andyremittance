import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Roles that only SUPER_ADMIN may edit
const ELEVATED_ROLES: string[] = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'];

// PATCH /api/users/:id — update user profile fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'MANAGE_USERS');
    if (check.denied) return check.response;

    const { id } = await params;

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!existing) return errorResponse('User not found', 404);

    // Non-super-admins cannot edit elevated-role users
    if (ELEVATED_ROLES.includes(existing.role) && check.ctx.userRole !== 'SUPER_ADMIN') {
      return errorResponse('Only Super Admin can edit Admin-level users', 403);
    }

    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      receivingPointId,
      password,
      isActive,
    } = body;

    // Validate role if provided
    if (role && !Object.values(UserRole).includes(role as UserRole)) {
      return errorResponse('Invalid role', 400);
    }

    // Non-super-admins cannot promote someone to an elevated role
    if (role && ELEVATED_ROLES.includes(role) && check.ctx.userRole !== 'SUPER_ADMIN') {
      return errorResponse('Only Super Admin can assign Admin-level roles', 403);
    }

    // If email is changing, ensure it's not taken
    if (email) {
      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (taken) return errorResponse('Email is already in use', 400);
    }

    // Build update payload — only include fields that were sent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (firstName !== undefined)        data.firstName        = firstName;
    if (lastName !== undefined)         data.lastName         = lastName;
    if (email !== undefined)            data.email            = email;
    if (phone !== undefined)            data.phone            = phone || null;
    if (role !== undefined)             data.role             = role;
    if (isActive !== undefined)         data.isActive         = isActive;

    // receivingPointId: allow explicit null to unlink
    if (Object.prototype.hasOwnProperty.call(body, 'receivingPointId')) {
      data.receivingPointId = receivingPointId || null;
    }

    // Password: only hash and update if a non-empty string was provided
    if (password && typeof password === 'string' && password.length >= 6) {
      data.password = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        receivingPoint: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    // If role changed to TELLER and no till exists yet, create one
    if (role === 'TELLER' && data.receivingPointId) {
      const tillExists = await prisma.ledgerAccount.findFirst({
        where: { userId: id, accountType: 'TELLER_TILL' },
      });
      if (!tillExists) {
        await prisma.ledgerAccount.create({
          data: {
            accountType: 'TELLER_TILL',
            accountName: `Till - ${updated.firstName} ${updated.lastName}`,
            accountCode: `TILL-${id.substring(0, 8)}`,
            userId: id,
            currency: 'GHS',
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: check.ctx.userId,
        action: 'UPDATE_USER',
        entity: 'User',
        entityId: id,
        changes: { updatedFields: Object.keys(data).filter((k) => k !== 'password') },
      },
    });

    return successResponse(updated, 'User updated successfully');
  } catch (error) {
    console.error('Update user error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return errorResponse(message);
  }
}

// DELETE /api/users/:id — soft-delete (deactivate)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'MANAGE_USERS');
    if (check.denied) return check.response;

    const { id } = await params;

    // Cannot deactivate yourself
    if (id === check.ctx.userId) {
      return errorResponse('You cannot deactivate your own account', 400);
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!existing) return errorResponse('User not found', 404);

    if (existing.role === 'SUPER_ADMIN') {
      return errorResponse('Super Admin accounts cannot be deactivated', 403);
    }

    if (ELEVATED_ROLES.includes(existing.role) && check.ctx.userRole !== 'SUPER_ADMIN') {
      return errorResponse('Only Super Admin can deactivate Admin-level users', 403);
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: check.ctx.userId,
        action: 'DEACTIVATE_USER',
        entity: 'User',
        entityId: id,
        changes: { isActive: false },
      },
    });

    return successResponse(null, 'User deactivated successfully');
  } catch (error) {
    console.error('Deactivate user error:', error);
    return errorResponse('Failed to deactivate user');
  }
}
