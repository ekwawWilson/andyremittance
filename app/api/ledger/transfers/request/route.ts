import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { Prisma, TransferRequestStatus } from '@prisma/client';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

// POST — teller creates a vault-to-till transfer request (no ledger movement yet)
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_TELLER_TILL');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId ?? undefined;

    const body = await request.json();
    const { fromAccountId, toAccountId, amount, notes } = requestSchema.parse(body);

    // Verify fromAccount is a vault and toAccount belongs to the requesting teller
    const [fromAccount, toAccount] = await Promise.all([
      prisma.ledgerAccount.findUnique({ where: { id: fromAccountId } }),
      prisma.ledgerAccount.findUnique({ where: { id: toAccountId } }),
    ]);

    if (!fromAccount || fromAccount.accountType !== 'COMPANY_VAULT') {
      return errorResponse('Source account must be a vault', 400);
    }
    if (!toAccount || toAccount.accountType !== 'TELLER_TILL' || toAccount.userId !== userId) {
      return errorResponse('Destination account must be your teller till', 400);
    }

    const transferRequest = await prisma.cashTransferRequest.create({
      data: {
        fromAccountId,
        toAccountId,
        amount,
        notes,
        requestedById: userId,
        receivingPointId,
      },
      include: {
        fromAccount: { select: { accountName: true, accountCode: true, balance: true } },
        toAccount: { select: { accountName: true, accountCode: true, balance: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return successResponse(transferRequest, 'Transfer request submitted — awaiting admin approval');
  } catch (error) {
    console.error('Transfer request error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create transfer request';
    return errorResponse(message);
  }
}

// GET — list transfer requests (branch-scoped)
export async function GET(request: NextRequest) {
  try {
    // Both tellers (MANAGE_TELLER_TILL) and branch admins (MANAGE_VAULT_TRANSFERS) need access
    const userId  = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    const receivingPointId = request.headers.get('x-receiving-point-id');

    if (!userId || !userRole) return errorResponse('Unauthorised', 401);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Admins/managers see all requests for their branch; tellers see only their own
    const isSuperAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);
    const isBranchAdmin = ['RECEIVING_ADMIN', 'MANAGER'].includes(userRole);
    const isTeller = userRole === 'TELLER';

    // Validate status against the enum so Prisma's where input stays typed
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'] as const;
    const parsedStatus = validStatuses.includes(status as TransferRequestStatus)
      ? (status as TransferRequestStatus)
      : undefined;
    const statusFilter: Prisma.CashTransferRequestWhereInput = parsedStatus ? { status: parsedStatus } : {};

    let requests;

    if (isSuperAdmin) {
      // No branch filter — super admins see all requests across all branches
      requests = await prisma.cashTransferRequest.findMany({
        where: statusFilter,
        include: {
          fromAccount: { select: { accountName: true, accountCode: true, balance: true } },
          toAccount:   { select: { accountName: true, accountCode: true, balance: true } },
          requestedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { requestedAt: 'desc' },
        take: 100,
      });
    } else if (isBranchAdmin && receivingPointId) {
      // Branch admin: include requests explicitly tagged to their branch
      // AND requests with no receivingPointId where the requesting teller belongs
      // to their branch (covers legacy rows created before the tag was reliable).
      requests = await prisma.cashTransferRequest.findMany({
        where: {
          ...statusFilter,
          OR: [
            { receivingPointId },
            {
              receivingPointId: null,
              requestedBy: { receivingPointId },
            },
          ],
        },
        include: {
          fromAccount: { select: { accountName: true, accountCode: true, balance: true } },
          toAccount:   { select: { accountName: true, accountCode: true, balance: true } },
          requestedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { requestedAt: 'desc' },
        take: 100,
      });
    } else if (isTeller) {
      // Teller — only their own requests
      requests = await prisma.cashTransferRequest.findMany({
        where: { ...statusFilter, requestedById: userId },
        include: {
          fromAccount: { select: { accountName: true, accountCode: true, balance: true } },
          toAccount:   { select: { accountName: true, accountCode: true, balance: true } },
          requestedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { requestedAt: 'desc' },
        take: 50,
      });
    } else {
      // Fallback: scope to branch if available, otherwise own requests only
      const fallbackWhere = receivingPointId
        ? { ...statusFilter, receivingPointId }
        : { ...statusFilter, requestedById: userId };
      requests = await prisma.cashTransferRequest.findMany({
        where: fallbackWhere,
        include: {
          fromAccount: { select: { accountName: true, accountCode: true, balance: true } },
          toAccount:   { select: { accountName: true, accountCode: true, balance: true } },
          requestedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { requestedAt: 'desc' },
        take: 50,
      });
    }

    return successResponse(requests);
  } catch (error) {
    console.error('Get transfer requests error:', error);
    return errorResponse('Failed to fetch transfer requests');
  }
}
