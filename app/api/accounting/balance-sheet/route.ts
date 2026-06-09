import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/accounting/balance-sheet?asOf=YYYY-MM-DD&receivingPointId=X
// Returns Balance Sheet: Assets, Liabilities, Equity at a point in time.
// Uses live LedgerAccount.balance for current snapshot.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_REPORTS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const asOf             = searchParams.get('asOf') ?? new Date().toISOString().split('T')[0];
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));

    // Fetch all active accounts
    const accountWhere: Record<string, unknown> = { isActive: true };
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
        sender:         { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ accountGroup: 'asc' }, { accountNumber: 'asc' }],
    });

    // Classify accounts into Balance Sheet sections
    const assetTypes    = ['COMPANY_CASH', 'COMPANY_VAULT', 'TELLER_TILL', 'BANK_CLEARING', 'MOMO_CLEARING', 'RECEIVABLE', 'SENDER'];
    const liabilityTypes = ['LIABILITY'];
    const equityTypes    = ['EQUITY'];
    // INCOME and EXPENSE are P&L accounts — not on balance sheet directly

    const assetAccounts    = accounts.filter((a) => assetTypes.includes(a.accountType));
    const liabilityAccounts = accounts.filter((a) => liabilityTypes.includes(a.accountType));
    const equityAccounts    = accounts.filter((a) => equityTypes.includes(a.accountType));

    const toRow = (acct: typeof accounts[number]) => ({
      id:              acct.id,
      accountCode:     acct.accountCode,
      accountName:     acct.accountName,
      accountType:     acct.accountType,
      accountGroup:    acct.accountGroup,
      accountNumber:   acct.accountNumber,
      currency:        acct.currency,
      balance:         Number(acct.balance),
      receivingPoint:  acct.receivingPoint ?? null,
      userName:        acct.user ? `${acct.user.firstName} ${acct.user.lastName}` : null,
      senderName:      acct.sender ? `${acct.sender.firstName} ${acct.sender.lastName}` : null,
    });

    const assets    = assetAccounts.map(toRow);
    const liabilities = liabilityAccounts.map(toRow);
    const equity    = equityAccounts.map(toRow);

    // Subtotals by currency
    const cadAssets   = assets.filter((a) => a.currency === 'CAD').reduce((s, a) => s + a.balance, 0);
    const ghsAssets   = assets.filter((a) => a.currency === 'GHS').reduce((s, a) => s + a.balance, 0);
    const cadLiab     = liabilities.filter((a) => a.currency === 'CAD').reduce((s, a) => s + a.balance, 0);
    const ghsLiab     = liabilities.filter((a) => a.currency === 'GHS').reduce((s, a) => s + a.balance, 0);
    const cadEquity   = equity.filter((a) => a.currency === 'CAD').reduce((s, a) => s + a.balance, 0);
    const ghsEquity   = equity.filter((a) => a.currency === 'GHS').reduce((s, a) => s + a.balance, 0);

    // Retained net income from INCOME - EXPENSE accounts (adds to equity in full balance sheet)
    const incExpAccounts = accounts.filter((a) => a.accountType === 'INCOME' || a.accountType === 'EXPENSE');
    const cadNetIncome = incExpAccounts
      .filter((a) => a.currency === 'CAD')
      .reduce((s, a) => s + (a.accountType === 'INCOME' ? Number(a.balance) : -Number(a.balance)), 0);
    const ghsNetIncome = incExpAccounts
      .filter((a) => a.currency === 'GHS')
      .reduce((s, a) => s + (a.accountType === 'INCOME' ? Number(a.balance) : -Number(a.balance)), 0);

    return successResponse({
      asOf,
      receivingPointId: receivingPointId ?? null,
      assets:      { rows: assets,     totalCAD: cadAssets,  totalGHS: ghsAssets  },
      liabilities: { rows: liabilities, totalCAD: cadLiab,   totalGHS: ghsLiab   },
      equity:      { rows: equity,      totalCAD: cadEquity, totalGHS: ghsEquity  },
      retainedNetIncome: { CAD: cadNetIncome, GHS: ghsNetIncome },
      summary: {
        CAD: { totalAssets: cadAssets, totalLiabilities: cadLiab, totalEquity: cadEquity + cadNetIncome, check: cadAssets - (cadLiab + cadEquity + cadNetIncome) },
        GHS: { totalAssets: ghsAssets, totalLiabilities: ghsLiab, totalEquity: ghsEquity + ghsNetIncome, check: ghsAssets - (ghsLiab + ghsEquity + ghsNetIncome) },
      },
    });
  } catch (error) {
    console.error('Balance sheet error:', error);
    return errorResponse('Failed to fetch balance sheet');
  }
}
