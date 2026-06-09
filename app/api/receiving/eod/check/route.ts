import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/receiving/eod/check?date=YYYY-MM-DD
// Returns: teller reconciliation status + till balances for the branch
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'RECEIVING_EOD');
    if (check.denied) return check.response;
    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(
      request,
      searchParams.get('receivingPointId')
    );

    if (!receivingPointId) {
      return errorResponse('A branch must be selected before running the EOD check', 400);
    }

    const dateParam = searchParams.get('date');
    if (!dateParam) return errorResponse('date parameter required', 400);

    const businessDate = new Date(dateParam + 'T00:00:00.000Z');
    const nextDay = new Date(businessDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    // Get all active tellers at this branch
    const tellers = await prisma.user.findMany({
      where: {
        receivingPointId,
        role: 'TELLER',
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        tellerLedger: {
          where: { accountType: 'TELLER_TILL' },
          select: { id: true, accountName: true, balance: true },
        },
      },
    });

    // Get reconciliations submitted for this date by tellers at this branch
    const reconciliations = await prisma.tellerReconciliation.findMany({
      where: {
        receivingPointId,
        reconciliationDate: { gte: businessDate, lt: nextDay },
      },
      select: {
        id: true,
        tellerId: true,
        status: true,
        actualClosing: true,
        variance: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const reconByTeller = new Map<string, typeof reconciliations[number]>();
    for (const reconciliation of reconciliations) {
      if (!reconByTeller.has(reconciliation.tellerId)) {
        reconByTeller.set(reconciliation.tellerId, reconciliation);
      }
    }

    const tellerStatus = tellers.map((teller) => {
      const recon = reconByTeller.get(teller.id);
      const till = teller.tellerLedger[0];
      const hasSubmitted = !!recon;
      const isResolved = !!recon && ['COMPLETED', 'APPROVED'].includes(recon.status);
      const requiresSupervisorReview = recon?.status === 'PENDING';
      const isRejected = recon?.status === 'REJECTED';

      return {
        tellerId: teller.id,
        tellerName: `${teller.firstName} ${teller.lastName}`,
        till: till
          ? { id: till.id, accountName: till.accountName, balance: Number(till.balance) }
          : null,
        reconciliation: recon
          ? {
              id: recon.id,
              status: recon.status,
              actualClosing: Number(recon.actualClosing),
              variance: Number(recon.variance),
            }
          : null,
        hasSubmitted,
        isResolved,
        requiresSupervisorReview,
        isRejected,
        tillBalance: till ? Number(till.balance) : 0,
      };
    });

    const unreconciledCount = tellerStatus.filter((t) => !t.hasSubmitted).length;
    const pendingApprovalCount = tellerStatus.filter((t) => t.requiresSupervisorReview).length;
    const rejectedCount = tellerStatus.filter((t) => t.isRejected).length;
    const allSubmitted = unreconciledCount === 0;
    const allResolved = tellerStatus.every((t) => t.isResolved);
    const pendingTills = tellerStatus.filter((t) => t.tillBalance !== 0);
    const pendingTransferTills = tellerStatus.filter((t) => t.tillBalance !== 0 && t.hasSubmitted);
    const tillsCleared = pendingTills.length === 0;
    const totalDisbursedToday = await prisma.transaction.aggregate({
      where: {
        receivingPointId,
        status: 'PAID',
        paidAt: { gte: businessDate, lt: nextDay },
      },
      _sum: { ghsAmount: true },
      _count: true,
    });

    // Check if already closed
    const existingEod = await prisma.receivingEodRecord.findUnique({
      where: { receivingPointId_date: { receivingPointId, date: businessDate } },
    });

    // Pending payable from the sending-side EOD not yet settled into this branch's vault
    const payableCode = `PAYABLE-GHS-${receivingPointId.substring(0, 8)}`;
    const payable = await prisma.ledgerAccount.findUnique({
      where: { accountCode: payableCode },
      select: { balance: true },
    });
    const pendingPayableGHS = payable ? Number(payable.balance) : 0;

    return successResponse({
      date: dateParam,
      receivingPointId,
      allSubmitted,
      allResolved,
      canClose: allSubmitted && pendingApprovalCount === 0 && rejectedCount === 0 && tillsCleared,
      // Force-close is available when there are unreconciled tellers OR non-zero tills,
      // but only when there are no pending/rejected approval reviews (those must be resolved first).
      canForceClose: pendingApprovalCount === 0 && rejectedCount === 0 && (!allSubmitted || !tillsCleared),
      pendingTransferTills,
      tillsCleared,
      unreconciledCount,
      pendingApprovalCount,
      rejectedCount,
      tellerStatus,
      pendingTills,
      totalDisbursedToday: Number(totalDisbursedToday._sum.ghsAmount ?? 0),
      disbursementCount: totalDisbursedToday._count,
      alreadyClosed: !!existingEod,
      existingEod,
      pendingPayableGHS,
    });
  } catch (error) {
    console.error('EOD check error:', error);
    return errorResponse('Failed to run EOD check');
  }
}
