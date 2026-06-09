import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/accounting/branch-summary?receivingPointId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// Per-branch accounting summary: vault balance, teller balances, disbursements,
// reconciliation status, variance totals, and GHS P&L for the period.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_REPORTS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const from             = searchParams.get('from');
    const to               = searchParams.get('to');

    if (!receivingPointId) return errorResponse('receivingPointId is required', 400);
    if (!from || !to)      return errorResponse('from and to date parameters are required', 400);

    const fromDate = new Date(from);
    const toDate   = new Date(to + 'T23:59:59.999Z');

    const [branch, vaultAccount, tellers, reconData, disbursementData, expenseData] = await Promise.all([
      // Branch info
      prisma.receivingPoint.findUnique({
        where: { id: receivingPointId },
        select: { id: true, name: true, code: true, city: true },
      }),
      // Vault balance
      prisma.ledgerAccount.findFirst({
        where: { accountType: 'COMPANY_VAULT', receivingPointId },
        select: { id: true, accountCode: true, accountName: true, balance: true, currency: true },
      }),
      // All tellers at branch with their till balances
      prisma.user.findMany({
        where: { receivingPointId, role: 'TELLER', isActive: true },
        select: {
          id: true, firstName: true, lastName: true,
          tellerLedger: {
            where: { accountType: 'TELLER_TILL' },
            select: { id: true, accountCode: true, balance: true, currency: true },
          },
        },
      }),
      // Reconciliation summary for period
      prisma.tellerReconciliation.findMany({
        where: {
          receivingPointId,
          reconciliationDate: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true, tellerId: true, status: true, variance: true, reconciliationDate: true,
          teller: { select: { firstName: true, lastName: true } },
        },
      }),
      // Disbursements in period
      prisma.transaction.aggregate({
        where: {
          receivingPointId,
          status: 'PAID',
          paidAt: { gte: fromDate, lte: toDate },
        },
        _sum: { ghsAmount: true },
        _count: true,
      }),
      // Expense journal lines in period (GHS)
      prisma.journalLine.findMany({
        where: {
          account: { accountType: 'EXPENSE', currency: 'GHS' },
          journalEntry: {
            status: 'POSTED',
            receivingPointId,
            journalDate: { gte: fromDate, lte: toDate },
          },
        },
        include: {
          account: { select: { accountCode: true, accountName: true, accountGroup: true } },
        },
      }),
    ]);

    if (!branch) return errorResponse('Branch not found', 404);

    // Teller till summary
    const tellerSummary = tellers.map((t) => ({
      tellerId:   t.id,
      tellerName: `${t.firstName} ${t.lastName}`,
      tillBalance: t.tellerLedger[0] ? Number(t.tellerLedger[0].balance) : 0,
      tillAccount: t.tellerLedger[0] ?? null,
    }));

    // Reconciliation summary
    const completedRecons = reconData.filter((r) => r.status === 'COMPLETED');
    const approvedRecons  = reconData.filter((r) => r.status === 'APPROVED');
    const pendingRecons   = reconData.filter((r) => r.status === 'PENDING');
    const rejectedRecons  = reconData.filter((r) => r.status === 'REJECTED');
    const resolvedRecons  = [...completedRecons, ...approvedRecons];
    const totalVariance   = resolvedRecons.reduce((s, r) => s + Number(r.variance), 0);
    const shortageAmount  = resolvedRecons.filter((r) => Number(r.variance) < 0).reduce((s, r) => s + Number(r.variance), 0);
    const excessAmount    = resolvedRecons.filter((r) => Number(r.variance) > 0).reduce((s, r) => s + Number(r.variance), 0);

    // Expense breakdown
    const expenseByAccount: Record<string, { accountName: string; amount: number }> = {};
    for (const line of expenseData) {
      const code = line.account.accountCode;
      if (!expenseByAccount[code]) expenseByAccount[code] = { accountName: line.account.accountName, amount: 0 };
      expenseByAccount[code].amount += Number(line.debit) - Number(line.credit);
    }

    return successResponse({
      branch,
      period: { from, to },
      vault: vaultAccount ? {
        accountCode: vaultAccount.accountCode,
        accountName: vaultAccount.accountName,
        balance:     Number(vaultAccount.balance),
        currency:    vaultAccount.currency,
      } : null,
      tellers: tellerSummary,
      totalTillBalance: tellerSummary.reduce((s, t) => s + t.tillBalance, 0),
      disbursements: {
        count:    disbursementData._count,
        totalGHS: Number(disbursementData._sum.ghsAmount ?? 0),
      },
      reconciliation: {
        completed: completedRecons.length,
        approved: approvedRecons.length,
        pending:  pendingRecons.length,
        rejected: rejectedRecons.length,
        totalVariance,
        shortageAmount,
        excessAmount,
        records: reconData,
      },
      expenses: Object.entries(expenseByAccount).map(([code, v]) => ({ accountCode: code, ...v })),
      totalExpenses: Object.values(expenseByAccount).reduce((s, v) => s + v.amount, 0),
    });
  } catch (error) {
    console.error('Branch summary error:', error);
    return errorResponse('Failed to fetch branch summary');
  }
}
