import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/accounting/income-statement?from=YYYY-MM-DD&to=YYYY-MM-DD&receivingPointId=X&currency=CAD
// Returns Income Statement: Revenue - Expenses = Net Income for the given period.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_REPORTS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const from             = searchParams.get('from');
    const to               = searchParams.get('to');
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const currency         = searchParams.get('currency') ?? 'CAD';

    if (!from || !to) return errorResponse('from and to date parameters are required', 400);

    const fromDate = new Date(from);
    const toDate   = new Date(to + 'T23:59:59.999Z');

    // Build account filter for income & expense accounts
    const incomeTypes  = ['INCOME'];
    const expenseTypes = ['EXPENSE'];

    const accountWhere: Record<string, unknown> = {
      currency,
      accountType: { in: [...incomeTypes, ...expenseTypes] },
    };
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
        accountGroup: true, accountNumber: true, currency: true,
        receivingPoint: { select: { name: true, code: true } },
      },
    });

    const accountIds = accounts.map((a) => a.id);

    // Aggregate journal line totals per account in period
    const lineTotals = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          status: 'POSTED',
          journalDate: { gte: fromDate, lte: toDate },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const totalsMap = new Map(lineTotals.map((t) => [t.accountId, {
      totalDebits:  Number(t._sum.debit  ?? 0),
      totalCredits: Number(t._sum.credit ?? 0),
    }]));

    // For income accounts: net = credits - debits (credits increase income)
    // For expense accounts: net = debits - credits (debits increase expense)
    const incomeRows = accounts
      .filter((a) => a.accountType === 'INCOME')
      .map((a) => {
        const { totalDebits = 0, totalCredits = 0 } = totalsMap.get(a.id) ?? {};
        return { ...a, totalDebits, totalCredits, amount: totalCredits - totalDebits };
      })
      .filter((r) => r.amount !== 0)
      .sort((a, b) => (a.accountNumber ?? '').localeCompare(b.accountNumber ?? ''));

    const expenseRows = accounts
      .filter((a) => a.accountType === 'EXPENSE')
      .map((a) => {
        const { totalDebits = 0, totalCredits = 0 } = totalsMap.get(a.id) ?? {};
        return { ...a, totalDebits, totalCredits, amount: totalDebits - totalCredits };
      })
      .filter((r) => r.amount !== 0)
      .sort((a, b) => (a.accountNumber ?? '').localeCompare(b.accountNumber ?? ''));

    const totalRevenue  = incomeRows.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);
    const netIncome     = totalRevenue - totalExpenses;

    // Transaction count stats for the period (sending-side enrichment)
    const txStats = await prisma.transaction.aggregate({
      where: {
        transactionDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' },
        ...(receivingPointId ? { receivingPointId } : {}),
      },
      _count: true,
      _sum: { cadAmount: true, ghsAmount: true },
    });

    return successResponse({
      period: { from, to },
      currency,
      receivingPointId: receivingPointId ?? null,
      income:   { rows: incomeRows,  total: totalRevenue  },
      expenses: { rows: expenseRows, total: totalExpenses },
      netIncome,
      transactionCount: txStats._count,
      totalCAD: Number(txStats._sum.cadAmount ?? 0),
      totalGHS: Number(txStats._sum.ghsAmount ?? 0),
    });
  } catch (error) {
    console.error('Income statement error:', error);
    return errorResponse('Failed to fetch income statement');
  }
}
