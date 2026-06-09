import { NextRequest } from 'next/server';
import { loginSchema } from '@/lib/validators/auth';
import { verifyPassword } from '@/lib/auth/password';
import { signJWT } from '@/lib/auth/jwt';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import prisma from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
      include: {
        receivingPoint: true,
      },
    });

    if (!user) {
      return errorResponse('Invalid credentials', 401);
    }

    if (!user.isActive) {
      return errorResponse('Account is disabled', 403);
    }

    // Verify password
    const isValid = await verifyPassword(validatedData.password, user.password);

    if (!isValid) {
      return errorResponse('Invalid credentials', 401);
    }

    // Generate JWT
    const token = await signJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      receivingPointId: user.receivingPointId || undefined,
    });

    // Fire-and-forget: non-critical writes — don't block the login response
    void Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          userRole: user.role,
          action: 'LOGIN',
          entity: 'User',
          entityId: user.id,
        },
      }),
    ]).catch((err) => console.error('Post-login write error:', err));

    return successResponse({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        receivingPoint: user.receivingPoint,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Login failed');
  }
}
