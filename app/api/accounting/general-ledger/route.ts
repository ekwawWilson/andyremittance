import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureTellerTillAccess, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/accounting/general-ledger?accountId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns all JournalLines for an account in date order with running balance.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_LEDGER_STATEMENT');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const accountId        = searchParams.get('accountId');
    const accountCode      = searchParams.get('accountCode');
    const from             = searchParams.get('from');
    const to               = searchParams.get('to');

    if (!accountId && !accountCode) {
      return errorResponse('accountId or accountCode is required', 400);
    }

    // Resolve accountCode → accountId if needed
    let resolvedAccountId = accountId;
    if (!resolvedAccountId && accountCode) {
      const acct = await prisma.ledgerAccount.findUnique({
        where: { accountCode },
        select: { id: true },
      });
      if (!acct) return errorResponse('Account not found', 404);
      resolvedAccountId = acct.id;
    }

    const account = await prisma.ledgerAccount.findUnique({
      where: { id: resolvedAccountId! },
      select: {
        id: true, accountCode: true, accountName: true, accountType: true,
        accountGroup: true, accountNumber: true, balance: true, currency: true,
        userId: true,
        receivingPointId: true,
        user: { select: { receivingPointId: true } },
        receivingPoint: { select: { name: true, code: true } },
      },
    });
    if (!account) return errorResponse('Account not found', 404);

    const tellerAccessError = ensureTellerTillAccess(
      check.ctx,
      account,
      'You are not allowed to view this teller till ledger'
    );
    if (tellerAccessError) return tellerAccessError;

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to)   dateFilter.lte = new Date(to + 'T23:59:59.999Z');

    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: resolvedAccountId!,
        journalEntry: {
          status: 'POSTED',
          ...(from || to ? { journalDate: dateFilter } : {}),
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true, journalDate: true, reference: true,
            description: true, entryType: true, status: true,
            receivingPointId: true, transactionId: true,
            reconciliationId: true, transferRequestId: true,
            createdBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [
        { journalEntry: { journalDate: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
      ],
    });

    // Calculate running balance
    let runningBalance = 0;
    const ledger = lines.map((line) => {
      const debit  = Number(line.debit);
      const credit = Number(line.credit);
      runningBalance += debit - credit;
      return {
        ...line,
        debit,
        credit,
        net: debit - credit,
        runningBalance,
      };
    });

    // Aggregate totals
    const totalDebits  = lines.reduce((s, l) => s + Number(l.debit),  0);
    const totalCredits = lines.reduce((s, l) => s + Number(l.credit), 0);

    return successResponse({
      account,
      ledger,
      totalDebits,
      totalCredits,
      netMovement: totalDebits - totalCredits,
      closingBalance: Number(account.balance),
      lineCount: lines.length,
    });
  } catch (error) {
    console.error('General ledger error:', error);
    return errorResponse('Failed to fetch general ledger');
  }
}
