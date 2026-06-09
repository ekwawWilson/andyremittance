import { NextRequest } from 'next/server';
import { createTransactionSchema } from '@/lib/validators/transaction';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import { TransactionService } from '@/lib/services/transaction.service';
import prisma from '@/lib/db/prisma';
import { Prisma, TransactionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const transactionService = new TransactionService();

// Transactions in these statuses belong only to the agent who created them.
// Once a transaction moves out of these statuses (synced, paid, etc.) it is
// visible to all sending-side users.
const PRE_SYNC_STATUSES: TransactionStatus[] = ['PENDING', 'PARTIAL'];

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'CREATE_TRANSACTIONS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();

    const validatedData = createTransactionSchema.parse(body);

    if (validatedData.exchangeRateOverride !== undefined) {
      const overrideCheck = await requirePermission(request, 'EDIT_EXCHANGE_RATE');
      if (overrideCheck.denied) return overrideCheck.response;
    }

    const transaction = await transactionService.createTransaction({
      ...validatedData,
      transactionDate: new Date(validatedData.transactionDate),
      createdById: userId,
    });

    return successResponse(transaction, 'Transaction created successfully');
  } catch (error) {
    console.error('Create transaction error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create transaction';
    return errorResponse(message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')!;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const status = searchParams.get('status');
    const requestedReceivingPointId = searchParams.get('receivingPointId');
    const transactionCode = searchParams.get('transactionCode');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const senderId = searchParams.get('senderId');
    const receiverId = searchParams.get('receiverId');
    let createdById = searchParams.get('createdById');
    const codeType = searchParams.get('codeType');
    const userReceivingPointId = request.headers.get('x-receiving-point-id');
    const receivingPointId = getScopedReceivingPointId(request, requestedReceivingPointId);

    // Scope-narrower: if the user does not hold VIEW_ALL_TRANSACTIONS,
    // restrict listing to their own transactions (sending agents) or their branch (receiving roles).
    const viewAll = await requirePermission(request, 'VIEW_ALL_TRANSACTIONS');
    if (viewAll.denied) {
      if (userReceivingPointId) {
        createdById = null;
      } else {
        // Sending agent: null out createdById so the OR filter below takes effect
        createdById = null;
      }
    }

    const where: Prisma.TransactionWhereInput = {};

    if (status) {
      const statuses = status.split(',').map((value) => value.trim()).filter(Boolean);
      where.status = statuses.length > 1
        ? { in: statuses as TransactionStatus[] }
        : (statuses[0] as TransactionStatus);
    }

    if (receivingPointId) {
      where.receivingPointId = receivingPointId;
      if (userReceivingPointId) {
        createdById = null;
      }
    }
    if (transactionCode) where.transactionCode = { contains: transactionCode };
    if (senderId) where.senderId = senderId;
    if (receiverId) where.receiverId = receiverId;
    if (createdById) where.createdById = createdById;
    if (codeType) where.codeType = codeType as Prisma.EnumTransactionCodeTypeFilter;

    // Apply sending-agent visibility rule AFTER where.status is built so the AND
    // correctly intersects any user-supplied status filter with the visibility rule:
    // - PENDING / PARTIAL → own transactions only
    // - everything else   → visible to all sending-side users
    if (viewAll.denied && !userReceivingPointId) {
      const visibilityFilter: Prisma.TransactionWhereInput = {
        OR: [
          { status: { in: PRE_SYNC_STATUSES }, createdById: userId },
          { status: { notIn: PRE_SYNC_STATUSES } },
        ],
      };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        visibilityFilter,
      ];
    }

    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(startDate);
      if (endDate) where.transactionDate.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          sender: true,
          receiver: true,
          receivingPoint: true,
          transactionReceivers: {
            include: { receiver: true },
          },
          subPayments: {
            orderBy: { paidAt: 'desc' },
          },
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return successResponse({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return errorResponse('Failed to fetch transactions');
  }
}
