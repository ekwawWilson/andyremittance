import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureTellerTillAccess, requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const check = await requirePermission(request, 'VIEW_LEDGER_STATEMENT');
    if (check.denied) return check.response;

    const { accountId } = await params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const account = await prisma.ledgerAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountType: true,
        userId: true,
        user: { select: { receivingPointId: true } },
      },
    });

    if (!account) return errorResponse('Account not found', 404);

    const tellerAccessError = ensureTellerTillAccess(
      check.ctx,
      account,
      'You are not allowed to view this teller statement'
    );
    if (tellerAccessError) return tellerAccessError;

    const statement = await ledgerService.getLedgerStatement(
      accountId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    return successResponse(statement);
  } catch (error) {
    console.error('Get ledger statement error:', error);
    return errorResponse('Failed to fetch ledger statement');
  }
}
