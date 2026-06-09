import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

// GET /api/ledger/till/status — returns the teller's own till balance + statement
//
// Single-day mode  (default / backwards-compatible):
//   ?date=YYYY-MM-DD   — statement for that day; omit for today
//
// Period mode:
//   ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — statement across the range
//   When a range is given, ?date is ignored.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_TELLER_TILL');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    const { searchParams } = new URL(request.url);
    const dateParam      = searchParams.get('date');
    const startDateParam = searchParams.get('startDate');
    const endDateParam   = searchParams.get('endDate');

    const isPeriod = !!(startDateParam && endDateParam);

    let dayStart: Date;
    let dayEnd: Date;

    if (isPeriod) {
      dayStart = new Date(startDateParam + 'T00:00:00.000Z');
      dayEnd   = new Date(endDateParam   + 'T23:59:59.999Z');
    } else if (dateParam) {
      dayStart = new Date(dateParam + 'T00:00:00.000Z');
      dayEnd   = new Date(dateParam + 'T23:59:59.999Z');
    } else {
      const now = new Date();
      dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date(now);
      dayEnd.setHours(23, 59, 59, 999);
    }

    // Guard: period cannot be longer than 92 days (one quarter)
    const diffMs = dayEnd.getTime() - dayStart.getTime();
    if (diffMs > 92 * 24 * 60 * 60 * 1000) {
      return errorResponse('Period range cannot exceed 92 days', 400);
    }

    // Find or create teller till
    let till = await prisma.ledgerAccount.findFirst({
      where: { accountType: 'TELLER_TILL', userId },
    });

    if (!till) {
      // Till doesn't exist yet — return zero balance with empty statement
      return successResponse({ till: null, balance: 0, statement: [], vaults: [], priorClosing: null, isHistorical: !!dateParam });
    }

    // For a single-day historical view, also fetch the reconciliation for that date
    const reconciliationForDate = (!isPeriod && dateParam) ? await prisma.tellerReconciliation.findFirst({
      where: {
        tellerId: userId,
        reconciliationDate: {
          gte: new Date(dateParam + 'T00:00:00.000Z'),
          lte: new Date(dateParam + 'T23:59:59.999Z'),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, actualClosing: true, expectedClosing: true,
        variance: true, openingBalance: true, paymentsMade: true, reconciliationDate: true,
      },
    }) : null;

    const statement = await ledgerService.getLedgerStatement(till.id, dayStart, dayEnd);

    // Return only vaults belonging to the teller's branch.
    // If the user has no receivingPointId (e.g. SUPER_ADMIN testing), return all vaults.
    const vaultWhere: Record<string, unknown> = { accountType: 'COMPANY_VAULT', isActive: true };
    if (receivingPointId) vaultWhere.receivingPointId = receivingPointId;

    const vaults = await prisma.ledgerAccount.findMany({
      where: vaultWhere,
      select: { id: true, accountName: true, accountCode: true, balance: true },
    });

    // Look up the most recent resolved reconciliation for this teller to derive
    // the opening balance for today's reconciliation form.
    const lastApprovedRecon = await prisma.tellerReconciliation.findFirst({
      where: {
        tellerId: userId,
        status: { in: ['COMPLETED', 'APPROVED'] },
      },
      orderBy: [
        { reconciliationDate: 'desc' },
        { createdAt: 'desc' },
      ],
      select: { actualClosing: true, reconciliationDate: true },
    });

    // Today's pending reconciliation status (for till page status indicator)
    const todayStart2 = new Date();
    todayStart2.setHours(0, 0, 0, 0);
    const todayRecon = await prisma.tellerReconciliation.findFirst({
      where: {
        tellerId: userId,
        reconciliationDate: { gte: todayStart2 },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, variance: true, actualClosing: true },
    });

    // For live today view use the stored balance (always up-to-date).
    // For any historical / period view derive the closing balance from the last
    // entry in the statement so it matches the running balance shown on screen.
    const isToday = !dateParam && !isPeriod;
    const closingBalance = isToday
      ? Number(till.balance)
      : statement.length > 0
        ? statement[statement.length - 1].runningBalance
        : await ledgerService.getLedgerBalanceAsOf(till.id, dayEnd);

    return successResponse({
      till: { id: till.id, accountName: till.accountName, accountCode: till.accountCode },
      balance: closingBalance,
      statement,
      vaults,
      priorClosing: lastApprovedRecon
        ? {
            amount: Number(lastApprovedRecon.actualClosing),
            date: lastApprovedRecon.reconciliationDate,
          }
        : null,
      isHistorical: !!dateParam || isPeriod,
      isPeriod,
      historicalDate: isPeriod ? null : (dateParam ?? null),
      periodStart: isPeriod ? startDateParam : null,
      periodEnd:   isPeriod ? endDateParam   : null,
      reconciliationForDate: reconciliationForDate ?? null,
      todayReconciliation: todayRecon ?? null,
    });
  } catch (error) {
    console.error('Till status error:', error);
    return errorResponse('Failed to fetch till status');
  }
}
