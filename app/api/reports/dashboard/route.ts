import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma, TransactionStatus } from '@prisma/client';

const PRE_SYNC_STATUSES: TransactionStatus[] = ['PENDING', 'PARTIAL'];

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where: Prisma.TransactionWhereInput = {
      status: { notIn: ['CANCELLED', 'VOID'] },
    };
    if (receivingPointId) where.receivingPointId = receivingPointId;
    // Sending agents: own pre-sync stats + shared post-sync stats
    if (userRole === 'SENDING_AGENT' && userId) {
      const agentVisibility: Prisma.TransactionWhereInput = {
        OR: [
          { status: { in: PRE_SYNC_STATUSES }, createdById: userId },
          { status: { notIn: PRE_SYNC_STATUSES } },
        ],
      };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        agentVisibility,
      ];
    }

    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(startDate);
      if (endDate) where.transactionDate.lte = new Date(endDate);
    }

    // The "today" panel follows the configured business date, but falls back to the
    // most recent date that actually has transactions when that date is empty.
    // Without this the panel reads zero whenever the business date has moved past
    // the data — a branch that closed EOD, or a day-sheet carrying an older date —
    // which makes a working dashboard look broken.
    const [config, latestTx] = await Promise.all([
      prisma.systemConfig.findFirst(),
      prisma.transaction.aggregate({ where, _max: { transactionDate: true } }),
    ]);

    const configuredStr = config?.sendingServerDate
      ? new Date(config.sendingServerDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const latestStr = latestTx._max.transactionDate?.toISOString().split('T')[0] ?? null;

    // Never look past the newest transaction — there is nothing there to count.
    const businessDateStr =
      latestStr && latestStr < configuredStr ? latestStr : configuredStr;
    const usingLatestActivity = businessDateStr !== configuredStr;

    const todayDate = new Date(`${businessDateStr}T00:00:00.000Z`);
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const todayWhere: Prisma.TransactionWhereInput = {
      ...where,
      transactionDate: { gte: todayDate, lt: tomorrowDate },
    };

    // Cancelled transactions are tracked separately and never included in financial totals
    const cancelledWhere: Prisma.TransactionWhereInput = {
      ...where,
      status: 'CANCELLED',
    };
    const todayCancelledWhere: Prisma.TransactionWhereInput = {
      ...todayWhere,
      status: 'CANCELLED',
    };

    // Every figure on the dashboard is independent, so they all go out together.
    // Run sequentially this took ~7s against 65k rows — each await is a round trip
    // to the database, and there were four of them.
    const [
      allStatusGroups,
      cancelledTransactions,
      todayCancelled,
      todayStatusGroups,
      recentTransactions,
      vaults,
    ] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { cadAmount: true, ghsAmount: true },
      }),
      prisma.transaction.count({ where: cancelledWhere }),
      prisma.transaction.count({ where: todayCancelledWhere }),
      prisma.transaction.groupBy({
        by: ['status'],
        where: todayWhere,
        _count: true,
        _sum: { cadAmount: true, ghsAmount: true },
      }),
      prisma.transaction.findMany({
        where: todayWhere,
        select: {
          id: true,
          transactionCode: true,
          codeType: true,
          status: true,
          cadAmount: true,
          ghsAmount: true,
          receivingMode: true,
          transactionDate: true,
          createdAt: true,
          sender: { select: { firstName: true, lastName: true } },
          receiver: { select: { firstName: true, lastName: true } },
          receivingPoint: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.ledgerAccount.findMany({
        where: {
          accountType: 'COMPANY_VAULT',
          ...(receivingPointId ? { receivingPointId } : {}),
        },
        include: { receivingPoint: { select: { name: true, code: true } } },
      }),
    ]);

    let totalTransactions = 0;
    let pendingTransactions = 0;
    let syncedTransactions = 0;
    let paidTransactions = 0;
    let allCAD = 0;
    let allGHS = 0;
    for (const g of allStatusGroups) {
      totalTransactions += g._count;
      allCAD += Number(g._sum.cadAmount ?? 0);
      allGHS += Number(g._sum.ghsAmount ?? 0);
      if (g.status === 'PENDING') pendingTransactions = g._count;
      else if (g.status === 'SYNCED' || g.status === 'PARTIAL_PAYMENT') syncedTransactions += g._count;
      else if (g.status === 'PAID') paidTransactions = g._count;
    }

    let todayCount = 0;
    let todayPending = 0;
    let todaySynced = 0;
    let todayPaid = 0;
    let todayCAD = 0;
    let todayGHS = 0;
    for (const g of todayStatusGroups) {
      todayCount += g._count;
      todayCAD += Number(g._sum.cadAmount ?? 0);
      todayGHS += Number(g._sum.ghsAmount ?? 0);
      if (g.status === 'PENDING') todayPending = g._count;
      else if (g.status === 'SYNCED' || g.status === 'PARTIAL_PAYMENT') todaySynced += g._count;
      else if (g.status === 'PAID') todayPaid = g._count;
    }


    return successResponse({
      summary: {
        totalTransactions,
        pendingTransactions,
        syncedTransactions,
        paidTransactions,
        cancelledTransactions,
        todayTransactions: todayCount,
        totalCAD: allCAD,
        totalGHS: allGHS,
      },
      /** The date the "today" panel covers, and whether it fell back to it. */
      businessDate: businessDateStr,
      usingLatestActivity,
      today: {
        count: todayCount,
        pending: todayPending,
        synced: todaySynced,
        paid: todayPaid,
        cancelled: todayCancelled,
        totalCAD: todayCAD,
        totalGHS: todayGHS,
      },
      vaults: vaults.map((v) => ({
        id: v.id,
        name: v.accountName,
        balance: v.balance,
        currency: v.currency,
        receivingPoint: v.receivingPoint,
      })),
      recentTransactions,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return errorResponse('Failed to fetch dashboard stats');
  }
}
