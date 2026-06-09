import { NextRequest } from 'next/server';
import { createReceiverSchema } from '@/lib/validators/receiver';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'CREATE_RECEIVERS');
    if (check.denied) return check.response;

    const body = await request.json();
    const validatedData = createReceiverSchema.parse(body);

    const receiver = await prisma.receiver.create({
      data: validatedData,
    });

    return successResponse(receiver, 'Receiver created successfully');
  } catch (error) {
    console.error('Create receiver error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create receiver';
    return errorResponse(message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_RECEIVERS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const senderId = searchParams.get('senderId');
    const search = searchParams.get('search');

    const where: Prisma.ReceiverWhereInput = { isActive: true };

    if (senderId) where.senderId = senderId;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const receivers = await prisma.receiver.findMany({
      where,
      include: {
        sender: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        _count: {
          select: { transactions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(receivers);
  } catch (error) {
    console.error('Get receivers error:', error);
    return errorResponse('Failed to fetch receivers');
  }
}
