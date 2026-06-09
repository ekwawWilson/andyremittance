import { NextRequest } from 'next/server';
import { registerSchema } from '@/lib/validators/auth';
import { hashPassword } from '@/lib/auth/password';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_USERS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existing) {
      return errorResponse('User with this email already exists', 400);
    }

    // Hash password
    const hashedPassword = await hashPassword(validatedData.password);
    const receivingPointId = getScopedReceivingPointId(
      request,
      validatedData.receivingPointId ?? null
    );

    const user = await prisma.user.create({
      data: {
        ...validatedData,
        password: hashedPassword,
        receivingPointId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        receivingPointId: true,
        isActive: true,
        createdAt: true,
      },
    });

    // If teller, create till ledger (only if one doesn't already exist for this user)
    if (validatedData.role === 'TELLER' && receivingPointId) {
      const existingTill = await prisma.ledgerAccount.findFirst({
        where: { accountType: 'TELLER_TILL', userId: user.id },
      });
      if (!existingTill) {
        await prisma.ledgerAccount.create({
          data: {
            accountType: 'TELLER_TILL',
            accountName: `Till - ${user.firstName} ${user.lastName}`,
            accountCode: `TILL-${user.id}`,
            userId: user.id,
            currency: 'GHS',
          },
        });
      }
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE_USER',
        entity: 'User',
        entityId: user.id,
        changes: { email: user.email, role: user.role },
      },
    });

    return successResponse(user, 'User created successfully');
  } catch (error) {
    console.error('Create user error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return errorResponse(message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_USERS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Prisma.UserWhereInput = { isActive: true };

    if (role) where.role = role as Prisma.EnumUserRoleFilter;
    if (receivingPointId) where.receivingPointId = receivingPointId;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          receivingPoint: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return successResponse({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    return errorResponse('Failed to fetch users');
  }
}
