import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/accounting/chart-of-accounts
// Returns all accounts grouped by accountGroup for the full Chart of Accounts.
// Optionally filtered by currency, accountType, or receivingPointId.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_LEDGER_STATEMENT');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const currency         = searchParams.get('currency');
    const accountType      = searchParams.get('accountType');
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const includeInactive  = searchParams.get('includeInactive') === 'true';

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (currency)         where.currency = currency;
    if (accountType)      where.accountType = accountType;
    if (receivingPointId) where.receivingPointId = receivingPointId;

    const accounts = await prisma.ledgerAccount.findMany({
      where,
      include: {
        user:           { select: { firstName: true, lastName: true } },
        sender:         { select: { firstName: true, lastName: true } },
        receivingPoint: { select: { name: true, code: true } },
      },
      orderBy: [
        { accountGroup: 'asc' },
        { accountNumber: 'asc' },
        { accountCode: 'asc' },
      ],
    });

    // Group by accountGroup for CoA display
    const groups: Record<string, {
      groupCode: string;
      groupLabel: string;
      accounts: typeof accounts;
      totalBalance: number;
    }> = {};

    const groupLabels: Record<string, string> = {
      '1000': 'Cash & Equivalents (CAD)',
      '2000': 'Cash & Equivalents (GHS)',
      '3000': 'Receivables',
      '4000': 'Payables',
      '5000': 'Equity',
      '6000': 'Income',
      '7000': 'Disbursement Expenses',
      '7400': 'Operational Expenses',
    };

    for (const acct of accounts) {
      const group = acct.accountGroup ?? 'OTHER';
      if (!groups[group]) {
        groups[group] = {
          groupCode:  group,
          groupLabel: groupLabels[group] ?? group,
          accounts:   [],
          totalBalance: 0,
        };
      }
      groups[group].accounts.push(acct);
      groups[group].totalBalance += Number(acct.balance);
    }

    const grouped = Object.values(groups).sort((a, b) =>
      a.groupCode.localeCompare(b.groupCode)
    );

    return successResponse({
      accounts,
      grouped,
      totalAccounts: accounts.length,
    });
  } catch (error) {
    console.error('Chart of accounts error:', error);
    return errorResponse('Failed to fetch chart of accounts');
  }
}

// POST /api/accounting/chart-of-accounts
// Create a new ledger account (admin only).
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_LEDGER_ACCOUNTS');
    if (check.denied) return check.response;

    const body = await request.json();
    const {
      accountCode, accountName, accountType, accountGroup, accountNumber,
      description, currency, receivingPointId,
    } = body;
    const scopedReceivingPointId = getScopedReceivingPointId(request, receivingPointId ?? null);

    if (!accountCode || !accountName || !accountType || !currency) {
      return errorResponse('accountCode, accountName, accountType, and currency are required', 400);
    }

    const existing = await prisma.ledgerAccount.findUnique({ where: { accountCode } });
    if (existing) return errorResponse('Account code already exists', 409);

    const account = await prisma.ledgerAccount.create({
      data: {
        accountCode,
        accountName,
        accountType,
        accountGroup:    accountGroup    ?? null,
        accountNumber:   accountNumber   ?? null,
        description:     description     ?? null,
        currency,
        receivingPointId: scopedReceivingPointId ?? null,
        balance: 0,
        isActive: true,
      },
    });

    return successResponse(account, 'Account created');
  } catch (error) {
    console.error('Create account error:', error);
    return errorResponse('Failed to create account');
  }
}
