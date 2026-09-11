import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';
import { branchBusinessDate } from '@/lib/services/till-guards';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

// GET /api/ledger/till/status — returns the teller's own till balance + statement
//
// Single-day mode  (default / backwards-compatible):
//   ?date=YYYY-MM-DD   — statement for that day; omit for the branch's
//                        current business date (NOT the wall-clock date)
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

    // Kicked off before anything awaits it so it overlaps the other work. Every
    // query here is a round trip to eu-west-1 at ~1.3-2 s, so the endpoint's cost
    // is almost entirely how many of them run one after another.
    const utcToday = () => {
      const n = new Date();
      return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    };
    const resolveBusinessDate: Promise<Date> = receivingPointId
      ? branchBusinessDate(receivingPointId)
      : Promise.resolve(utcToday());

    let dayStart: Date;
    let dayEnd: Date;

    if (isPeriod) {
      dayStart = new Date(startDateParam + 'T00:00:00.000Z');
      dayEnd   = new Date(endDateParam   + 'T23:59:59.999Z');
    } else if (dateParam) {
      dayStart = new Date(dateParam + 'T00:00:00.000Z');
      dayEnd   = new Date(dateParam + 'T23:59:59.999Z');
    } else {
      // Default to the branch's business date, not the wall clock. Ledger entries
      // are stamped with the business date at UTC midnight, so a browser opened on
      // 11 Sept while the branch is still working 10 Sept would ask for a day with
      // no entries and the reconciliation form would pre-fill with zeros.
      //
      // setHours() also built the window in local time, which shifts it off the
      // UTC-midnight entries on any server that is not on UTC.
      dayStart = await resolveBusinessDate;
      dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
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

    // Everything below needs only till.id, so it all goes out together rather
    // than one await at a time — this endpoint took ~11 s sequentially, which is
    // long enough that the reconciliation form looks like it failed to pre-fill.
    const vaultWhere: Record<string, unknown> = { accountType: 'COMPANY_VAULT', isActive: true };
    if (receivingPointId) vaultWhere.receivingPointId = receivingPointId;

    const [reconciliationForDate, statement, vaults, lastApprovedRecon, currentBusinessDate] =
      await Promise.all([
        // For a single-day historical view, the reconciliation for that date.
        (!isPeriod && dateParam)
          ? prisma.tellerReconciliation.findFirst({
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
            })
          : Promise.resolve(null),
        ledgerService.getLedgerStatement(till.id, dayStart, dayEnd),
        // Only vaults at the teller's branch; all of them for an unscoped admin.
        prisma.ledgerAccount.findMany({
          where: vaultWhere,
          select: { id: true, accountName: true, accountCode: true, balance: true },
        }),
        // The last resolved reconciliation gives the opening balance for the form.
        prisma.tellerReconciliation.findFirst({
          where: { tellerId: userId, status: { in: ['COMPLETED', 'APPROVED'] } },
          orderBy: [{ reconciliationDate: 'desc' }, { createdAt: 'desc' }],
          select: { actualClosing: true, reconciliationDate: true },
        }),
        resolveBusinessDate,
      ]);

    // Judged against the branch's business date, not the wall clock — otherwise a
    // teller working past midnight is told they have not reconciled yet.
    const todayRecon = await prisma.tellerReconciliation.findFirst({
      where: { tellerId: userId, reconciliationDate: { gte: currentBusinessDate } },
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
