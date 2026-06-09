import { NextRequest } from 'next/server';
import { createSenderSchema } from '@/lib/validators/sender';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'CREATE_SENDERS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const validatedData = createSenderSchema.parse(body);

    const sender = await prisma.sender.create({
      data: {
        ...validatedData,
        createdById: userId,
      },
    });

    // Create sender ledger account
    await prisma.ledgerAccount.create({
      data: {
        accountType: 'SENDER',
        accountName: `${sender.firstName} ${sender.lastName}`,
        accountCode: `SENDER-${sender.id.substring(0, 8)}`,
        senderId: sender.id,
        currency: 'CAD',
      },
    });

    return successResponse(sender, 'Sender created successfully');
  } catch (error) {
    console.error('Create sender error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create sender';
    return errorResponse(message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_SENDERS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Prisma.SenderWhereInput = { isActive: true };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [senders, total] = await Promise.all([
      prisma.sender.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          country: true,
          idType: true,
          idNumber: true,
          creditLimit: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          senderLedger: { select: { balance: true, currency: true } },
          _count: { select: { transactions: true } },
          receivers: {
            where: { isActive: true },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              preferredMethod: true,
              bankName: true,
              bankAccount: true,
              momoNumber: true,
              momoProvider: true,
              relationshipToSender: true,
            },
            orderBy: { firstName: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sender.count({ where }),
    ]);

    return successResponse({
      senders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get senders error:', error);
    return errorResponse('Failed to fetch senders');
  }
}
