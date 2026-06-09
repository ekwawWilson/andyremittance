import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/accounting/trial-balance?receivingPointId=X&currency=GHS&asOf=YYYY-MM-DD
// Returns all accounts with total debits, total credits, and net balance from journal lines.
// If asOf is provided, balance is computed from journal lines up to that date.
// If no asOf, uses the current live balance field on LedgerAccount.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_REPORTS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const currency         = searchParams.get('currency');
    const asOf             = searchParams.get('asOf'); // YYYY-MM-DD

    // When asOf is provided, compute balances from journal lines
    if (asOf) {
      const asOfDate = new Date(asOf + 'T23:59:59.999Z');

      // Get all accounts scoped to filter
      const accountWhere: Record<string, unknown> = { isActive: true };
      if (currency)         accountWhere.currency = currency;
      if (receivingPointId) {
        accountWhere.OR = [
          { receivingPointId },
          { receivingPointId: null },
        ];
      }

      const accounts = await prisma.ledgerAccount.findMany({
        where: accountWhere,
        select: {
          id: true, accountCode: true, accountName: true, accountType: true,
          accountGroup: true, accountNumber: true, currency: true, balance: true,
          receivingPoint: { select: { name: true, code: true } },
        },
      });

      // Aggregate journal line totals per account up to asOf date
      const lineTotals = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: {
            status: 'POSTED',
            journalDate: { lte: asOfDate },
          },
          accountId: { in: accounts.map((a) => a.id) },
        },
        _sum: { debit: true, credit: true },
      });

      const totalsMap = new Map(lineTotals.map((t) => [
        t.accountId,
        {
          totalDebits:  Number(t._sum.debit  ?? 0),
          totalCredits: Number(t._sum.credit ?? 0),
        },
      ]));

      const rows = accounts.map((acct) => {
        const { totalDebits = 0, totalCredits = 0 } = totalsMap.get(acct.id) ?? {};
        const netBalance = totalDebits - totalCredits;
        return { ...acct, totalDebits, totalCredits, netBalance, balance: Number(acct.balance) };
      }).filter((r) => r.totalDebits !== 0 || r.totalCredits !== 0);

      rows.sort((a, b) => (a.accountGroup ?? '').localeCompare(b.accountGroup ?? '') || (a.accountNumber ?? '').localeCompare(b.accountNumber ?? ''));

      const grandTotalDebits  = rows.reduce((s, r) => s + r.totalDebits,  0);
      const grandTotalCredits = rows.reduce((s, r) => s + r.totalCredits, 0);

      return successResponse({ asOf, rows, grandTotalDebits, grandTotalCredits, isBalanced: Math.abs(grandTotalDebits - grandTotalCredits) < 0.01 });
    }

    // Live trial balance — use current LedgerAccount.balance
    const accountWhere: Record<string, unknown> = { isActive: true };
    if (currency)         accountWhere.currency = currency;
    if (receivingPointId) {
      accountWhere.OR = [
        { receivingPointId },
        { receivingPointId: null },
      ];
    }

    const accounts = await prisma.ledgerAccount.findMany({
      where: accountWhere,
      include: {
        user:           { select: { firstName: true, lastName: true } },
        receivingPoint: { select: { name: true, code: true } },
      },
      orderBy: [{ accountGroup: 'asc' }, { accountNumber: 'asc' }, { accountCode: 'asc' }],
    });

    // For live trial balance, compute debits/credits from all POSTED journal lines
    const lineTotals = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { status: 'POSTED' },
        accountId: { in: accounts.map((a) => a.id) },
      },
      _sum: { debit: true, credit: true },
    });
    const totalsMap = new Map(lineTotals.map((t) => [t.accountId, {
      totalDebits:  Number(t._sum.debit  ?? 0),
      totalCredits: Number(t._sum.credit ?? 0),
    }]));

    const rows = accounts.map((acct) => {
      const { totalDebits = 0, totalCredits = 0 } = totalsMap.get(acct.id) ?? {};
      return { ...acct, balance: Number(acct.balance), totalDebits, totalCredits, netBalance: totalDebits - totalCredits };
    });

    const grandTotalDebits  = rows.reduce((s, r) => s + r.totalDebits,  0);
    const grandTotalCredits = rows.reduce((s, r) => s + r.totalCredits, 0);

    return successResponse({ asOf: null, rows, grandTotalDebits, grandTotalCredits, isBalanced: Math.abs(grandTotalDebits - grandTotalCredits) < 0.01 });
  } catch (error) {
    console.error('Trial balance error:', error);
    return errorResponse('Failed to fetch trial balance');
  }
}
