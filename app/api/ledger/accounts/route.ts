import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma, LedgerAccountType } from '@prisma/client';

export const dynamic = 'force-dynamic';

// AUTH: requires ledger statement access
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_LEDGER_STATEMENT');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const accountType = searchParams.get('accountType') as LedgerAccountType | null;
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));

    const where: Prisma.LedgerAccountWhereInput = { isActive: true };

    if (accountType) where.accountType = accountType;
    if (receivingPointId) {
      if (accountType === 'TELLER_TILL') {
        where.user = { receivingPointId };
      } else if (accountType) {
        where.receivingPointId = receivingPointId;
      } else {
        where.OR = [
          { receivingPointId },
          { accountType: 'TELLER_TILL', user: { receivingPointId } },
        ];
      }
    }

    const accounts = await prisma.ledgerAccount.findMany({
      where,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sender: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        receivingPoint: {
          select: {
            name: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(accounts);
  } catch (error) {
    console.error('Get ledger accounts error:', error);
    return errorResponse('Failed to fetch ledger accounts');
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_LEDGER_ACCOUNTS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const receivingPointId = getScopedReceivingPointId(request, body.receivingPointId ?? null);

    const account = await prisma.ledgerAccount.create({
      data: {
        ...body,
        receivingPointId,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE_LEDGER_ACCOUNT',
        entity: 'LedgerAccount',
        entityId: account.id,
        changes: body,
      },
    });

    return successResponse(account, 'Ledger account created successfully');
  } catch (error) {
    console.error('Create ledger account error:', error);
    return errorResponse('Failed to create ledger account');
  }
}
