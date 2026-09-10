import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { tillsNotZero } from '@/lib/services/till-guards';

export const dynamic = 'force-dynamic';

const closeSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  notes: z.string().optional(),
  forceClose: z.boolean().optional(), // allow closing even if not all tellers reconciled
  receivingPointId: z.string().uuid().optional().nullable(),
});

// POST /api/receiving/eod — close branch end-of-day
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'RECEIVING_EOD');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const { date, notes, forceClose, receivingPointId: requestedReceivingPointId } =
      closeSchema.parse(body);
    const receivingPointId = getScopedReceivingPointId(
      request,
      requestedReceivingPointId ?? null
    );

    if (!receivingPointId) {
      return errorResponse('A branch must be selected before closing receiving EOD', 400);
    }

    const businessDate = new Date(date + 'T00:00:00.000Z');
    const nextDay = new Date(businessDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    // Guard: not already closed
    const existing = await prisma.receivingEodRecord.findUnique({
      where: { receivingPointId_date: { receivingPointId, date: businessDate } },
    });
    if (existing) {
      return errorResponse('Branch EOD has already been closed for this date', 400);
    }

    const [tellers, reconciliations] = await Promise.all([
      prisma.user.findMany({
        where: { receivingPointId, role: 'TELLER', isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          tellerLedger: {
            where: { accountType: 'TELLER_TILL' },
            select: { balance: true },
          },
        },
      }),
      prisma.tellerReconciliation.findMany({
        where: {
          receivingPointId,
          reconciliationDate: { gte: businessDate, lt: nextDay },
        },
        select: {
          tellerId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const latestReconByTeller = new Map<string, typeof reconciliations[number]>();
    for (const reconciliation of reconciliations) {
      if (!latestReconByTeller.has(reconciliation.tellerId)) {
        latestReconByTeller.set(reconciliation.tellerId, reconciliation);
      }
    }

    const unreconciledTellers = tellers.filter((teller) => !latestReconByTeller.has(teller.id));
    const pendingReviewReconciliations = Array.from(latestReconByTeller.values()).filter(
      (reconciliation) => reconciliation.status === 'PENDING'
    );
    const rejectedReconciliations = Array.from(latestReconByTeller.values()).filter(
      (reconciliation) => reconciliation.status === 'REJECTED'
    );
    const readyReconciliations = Array.from(latestReconByTeller.values()).filter(
      (reconciliation) =>
        reconciliation.status === 'COMPLETED' || reconciliation.status === 'APPROVED'
    );

    if (pendingReviewReconciliations.length > 0) {
      return errorResponse(
        `${pendingReviewReconciliations.length} reconciliation(s) still require supervisor approval before EOD can be closed.`,
        400
      );
    }

    if (rejectedReconciliations.length > 0) {
      return errorResponse(
        `${rejectedReconciliations.length} reconciliation(s) were rejected and must be resubmitted before EOD can be closed.`,
        400
      );
    }

    if (unreconciledTellers.length > 0 && !forceClose) {
      return errorResponse(
        `${unreconciledTellers.length} teller(s) have not submitted reconciliation. Use forceClose: true to override.`,
        400
      );
    }

    // Every till must read exactly zero before the day closes, unless force-closing.
    // Checking `!== 0` rather than `> 0` matters: a negative till means more went
    // out than the drawer ever held, and closing on it carries the error into
    // tomorrow's opening balance where it is far harder to trace.
    const unclearedTills = tillsNotZero(tellers);
    if (unclearedTills.length > 0 && !forceClose) {
      const names = unclearedTills
        .map(({ teller, balance }) =>
          `${teller.firstName} ${teller.lastName} (GHS ${balance.toLocaleString('en-GH', { minimumFractionDigits: 2 })})`)
        .join(', ');
      const anyNegative = unclearedTills.some(({ balance }) => balance < 0);
      return errorResponse(
        `${unclearedTills.length} teller till(s) are not zero: ${names}. ` +
        (anyNegative
          ? 'A negative till means more was disbursed than the drawer held — investigate before closing. '
          : 'Return the cash to the vault, ') +
        'or force-close to override.',
        400
      );
    }

    // What actually left the branch today.
    //
    // Counting only PAID transactions missed every instalment on a transaction
    // still sitting at PARTIAL_PAYMENT — real cash, not reported. But a
    // transaction finished off in instalments ends up PAID *and* carrying
    // sub-payments for its full value, so adding the two naively double-counts.
    //
    // These two sets are therefore disjoint by construction:
    //   · transactions paid in a single go   — PAID, with no sub-payments
    //   · every sub-payment made today       — whatever its transaction's status
    //
    // Reversed disbursements fall out of both: reversal clears paidAt, resets the
    // status to SYNCED and deletes the sub-payments it undid.
    const [singlePayouts, instalments] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          receivingPointId,
          status: 'PAID',
          paidAt: { gte: businessDate, lt: nextDay },
          subPayments: { none: {} },
        },
        _sum: { ghsAmount: true },
        _count: true,
      }),
      prisma.subPayment.aggregate({
        where: {
          paidAt: { gte: businessDate, lt: nextDay },
          transaction: { receivingPointId },
        },
        _sum: { ghsAmount: true },
        _count: true,
      }),
    ]);

    const disbursementStats = {
      _sum: {
        ghsAmount:
          Number(singlePayouts._sum.ghsAmount ?? 0) + Number(instalments._sum.ghsAmount ?? 0),
      },
      _count: singlePayouts._count + instalments._count,
    };

    // Advancing the business date and writing the record must happen together.
    // Done separately, a failure between them left the branch on the next day
    // with no record of closing — and because the "already closed" guard keys on
    // (branch, date), the day could then be closed again and the date advanced twice.
    const eodRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.receivingEodRecord.create({
        data: {
          receivingPointId,
          date: businessDate,
          closedById: userId,
          totalDisbursed: disbursementStats._sum.ghsAmount ?? 0,
          disbursementCount: disbursementStats._count,
          notes,
        },
        include: {
          closedBy: { select: { firstName: true, lastName: true } },
          receivingPoint: { select: { name: true, code: true } },
        },
      });

      await tx.receivingPoint.update({
        where: { id: receivingPointId },
        data: { serverDate: nextDay },
      });

      return record;
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'RECEIVING_EOD_CLOSE',
        entity: 'ReceivingEodRecord',
        entityId: eodRecord.id,
        changes: JSON.parse(JSON.stringify({
          date,
          receivingPointId,
          totalDisbursed: Number(disbursementStats._sum.ghsAmount ?? 0),
          disbursementCount: disbursementStats._count,
          reconciliationsReady: readyReconciliations.length,
          unreconciledTellers: unreconciledTellers.length,
          forceClosed: !!forceClose,
        })),
      },
    });

    return successResponse({
      eodRecord,
      reconciliationsReady: readyReconciliations.length,
      totalDisbursed: Number(disbursementStats._sum.ghsAmount ?? 0),
      disbursementCount: disbursementStats._count,
    }, 'Branch end-of-day closed successfully');
  } catch (error) {
    console.error('Receiving EOD close error:', error);
    const message = error instanceof Error ? error.message : 'Failed to close receiving EOD';
    return errorResponse(message);
  }
}

// GET /api/receiving/eod — branch EOD history
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'RECEIVING_EOD');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(
      request,
      searchParams.get('receivingPointId')
    );
    if (!receivingPointId) return errorResponse('A branch must be selected first', 400);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const [records, total] = await Promise.all([
      prisma.receivingEodRecord.findMany({
        where: { receivingPointId },
        include: {
          closedBy: { select: { firstName: true, lastName: true } },
          receivingPoint: { select: { name: true, code: true } },
        },
        orderBy: { closedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.receivingEodRecord.count({ where: { receivingPointId } }),
    ]);

    return successResponse({
      records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Receiving EOD history error:', error);
    return errorResponse('Failed to fetch receiving EOD history');
  }
}
