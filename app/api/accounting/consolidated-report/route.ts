import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/accounting/consolidated-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Company-wide consolidated report: all branches + sending side combined.
// All GHS amounts are also expressed in CAD at the reporting exchange rate.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_REPORTS');
    if (check.denied) return check.response;
    const { userRole } = check.ctx;

    // Consolidated reports are admin-only
    if (!['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'].includes(userRole)) {
      return errorResponse('Consolidated reports require admin access', 403);
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to');

    if (!from || !to) return errorResponse('from and to date parameters are required', 400);

    const fromDate = new Date(from);
    const toDate   = new Date(to + 'T23:59:59.999Z');

    // Reporting exchange rate — use most recent rate or a provided override
    const rateOverride = searchParams.get('exchangeRate');
    let reportingRate: number;
    if (rateOverride) {
      reportingRate = parseFloat(rateOverride);
    } else {
      const latestRate = await prisma.exchangeRate.findFirst({
        orderBy: { date: 'desc' },
        select: { cadToGhs: true, date: true },
      });
      reportingRate = latestRate ? Number(latestRate.cadToGhs) : 1;
    }

    const [branches, transactions, cadAccounts, reconSummary] = await Promise.all([
      // All active branches
      prisma.receivingPoint.findMany({
        where: { isActive: true },
        select: {
          id: true, name: true, code: true, city: true,
          vaultLedger: {
            where: { accountType: 'COMPANY_VAULT', isActive: true },
            select: { balance: true, accountCode: true },
          },
        },
      }),

      // Transaction summary across all branches
      prisma.transaction.groupBy({
        by: ['receivingPointId', 'status'],
        where: { transactionDate: { gte: fromDate, lte: toDate } },
        _sum:   { cadAmount: true, ghsAmount: true },
        _count: true,
      }),

      // CAD-side accounts summary
      prisma.ledgerAccount.findMany({
        where: {
          currency:    'CAD',
          accountType: { in: ['COMPANY_CASH', 'INCOME', 'RECEIVABLE'] },
          isActive:    true,
        },
        select: { accountCode: true, accountName: true, accountType: true, balance: true },
      }),

      // Reconciliation variance by branch in period
      prisma.tellerReconciliation.groupBy({
        by: ['receivingPointId', 'status'],
        where: {
          reconciliationDate: { gte: fromDate, lte: toDate },
          status: { in: ['COMPLETED', 'APPROVED'] },
        },
        _sum:   { variance: true },
        _count: true,
      }),
    ]);

    // Build per-branch summaries
    const branchMap = new Map(branches.map((b) => [b.id, b]));
    const txByBranch: Record<string, {
      pendingCount: number; syncedCount: number; paidCount: number;
      totalCAD: number; totalGHS: number; paidGHS: number;
    }> = {};

    for (const row of transactions) {
      const id = row.receivingPointId;
      if (!txByBranch[id]) txByBranch[id] = { pendingCount: 0, syncedCount: 0, paidCount: 0, totalCAD: 0, totalGHS: 0, paidGHS: 0 };
      txByBranch[id].totalCAD += Number(row._sum.cadAmount ?? 0);
      txByBranch[id].totalGHS += Number(row._sum.ghsAmount ?? 0);
      if (row.status === 'PAID') {
        txByBranch[id].paidCount += row._count;
        txByBranch[id].paidGHS   += Number(row._sum.ghsAmount ?? 0);
      }
      if (row.status === 'SYNCED')  txByBranch[id].syncedCount  += row._count;
      if (row.status === 'PENDING') txByBranch[id].pendingCount += row._count;
    }

    const reconMap = new Map<string, { totalVariance: number; reconCount: number }>();
    for (const row of reconSummary) {
      const current = reconMap.get(row.receivingPointId) ?? { totalVariance: 0, reconCount: 0 };
      current.totalVariance += Number(row._sum.variance ?? 0);
      current.reconCount += row._count;
      reconMap.set(row.receivingPointId, current);
    }

    const branchSummaries = branches.map((b) => {
      const vaultBalance = b.vaultLedger[0] ? Number(b.vaultLedger[0].balance) : 0;
      const tx           = txByBranch[b.id] ?? { pendingCount: 0, syncedCount: 0, paidCount: 0, totalCAD: 0, totalGHS: 0, paidGHS: 0 };
      const recon        = reconMap.get(b.id) ?? { totalVariance: 0, reconCount: 0 };
      return {
        branchId:   b.id,
        branchName: b.name,
        branchCode: b.code,
        city:       b.city,
        vaultBalance,
        vaultCADEquiv: reportingRate > 0 ? vaultBalance / reportingRate : 0,
        transactions: tx,
        reconciliation: recon,
      };
    });

    // Company-wide CAD summary
    const cadCash      = cadAccounts.find((a) => a.accountType === 'COMPANY_CASH');
    const cadIncome    = cadAccounts.filter((a) => a.accountType === 'INCOME').reduce((s, a) => s + Number(a.balance), 0);
    const cadReceivable = cadAccounts.filter((a) => a.accountType === 'RECEIVABLE').reduce((s, a) => s + Number(a.balance), 0);

    // Total GHS across all vaults
    const totalGHSVaults = branchSummaries.reduce((s, b) => s + b.vaultBalance, 0);
    const totalGHSCADEquiv = reportingRate > 0 ? totalGHSVaults / reportingRate : 0;

    // Totals across all branches
    const totals = branchSummaries.reduce((acc, b) => ({
      paidTransactions: acc.paidTransactions + b.transactions.paidCount,
      totalCAD:         acc.totalCAD         + b.transactions.totalCAD,
      totalGHS:         acc.totalGHS         + b.transactions.totalGHS,
      totalVariance:    acc.totalVariance    + b.reconciliation.totalVariance,
    }), { paidTransactions: 0, totalCAD: 0, totalGHS: 0, totalVariance: 0 });

    return successResponse({
      period: { from, to },
      reportingExchangeRate: reportingRate,
      branches: branchSummaries,
      sendingSide: {
        companyCashCAD:   cadCash ? Number(cadCash.balance) : 0,
        totalIncomeCAD:   cadIncome,
        totalReceivableCAD: cadReceivable,
      },
      consolidated: {
        ...totals,
        totalGHSVaults,
        totalGHSCADEquiv,
        netCADPosition: (cadCash ? Number(cadCash.balance) : 0) + totalGHSCADEquiv,
      },
    });
  } catch (error) {
    console.error('Consolidated report error:', error);
    return errorResponse('Failed to fetch consolidated report');
  }
}
