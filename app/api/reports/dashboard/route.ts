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

    // Use the business server date so "today" reflects the configured business date,
    // not the wall-clock date (which diverges when the sending admin has advanced/rolled back the date).
    const config = await prisma.systemConfig.findFirst();
    const businessDateStr = config?.sendingServerDate
      ? new Date(config.sendingServerDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
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

    // Use groupBy + aggregate to minimise queries (connection_limit=1)
    // 1. All-time: status counts + totals (CANCELLED excluded via base where)
    const [allStatusGroups, cancelledTransactions, todayCancelled] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { cadAmount: true, ghsAmount: true },
      }),
      prisma.transaction.count({ where: cancelledWhere }),
      prisma.transaction.count({ where: todayCancelledWhere }),
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

    // 2. Today: status counts + totals (CANCELLED excluded via todayWhere)
    const todayStatusGroups = await prisma.transaction.groupBy({
      by: ['status'],
      where: todayWhere,
      _count: true,
      _sum: { cadAmount: true, ghsAmount: true },
    });

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

    // 3. Today's transactions list (most recent 50, branch-scoped)
    const recentTransactions = await prisma.transaction.findMany({
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
    });

    // 4. Vault balances
    const vaults = await prisma.ledgerAccount.findMany({
      where: {
        accountType: 'COMPANY_VAULT',
        ...(receivingPointId ? { receivingPointId } : {}),
      },
      include: {
        receivingPoint: {
          select: { name: true, code: true },
        },
      },
    });

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
