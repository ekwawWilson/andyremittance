import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// GET /api/reports/agent?agentId=...&startDate=...&endDate=...
// Returns per-agent transaction summary, grouped by branch and receiving mode
export async function GET(request: NextRequest) {
  try {
    const currentUserId = request.headers.get('x-user-id')!;
    const userRole = request.headers.get('x-user-role')!;

    // Agents see only own data; others must hold VIEW_AGENT_REPORTS
    const { searchParams } = new URL(request.url);
    let agentId = searchParams.get('agentId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeAll = searchParams.get('includeAll') === 'true';

    if (userRole === 'SENDING_AGENT') {
      agentId = currentUserId; // force own data
    } else {
      const check = await requirePermission(request, 'VIEW_AGENT_REPORTS');
      if (check.denied) return check.response;
    }

    const where: Prisma.TransactionWhereInput = {
      status: { not: 'CANCELLED' },
    };
    if (agentId) where.createdById = agentId;
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(startDate);
      if (endDate) where.transactionDate.lte = new Date(endDate);
    }

    const page = parseInt(new URL(request.url).searchParams.get('page') || '1');
    const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '50'), 200);

    const [
      transactions,
      totalCount,
      totalCAD,
      totalGHS,
      statusCounts,
      byModeCounts,
      byPaymentMethodCounts,
      byCodeTypeCounts,
    ] = await Promise.all([
      // Paginated transaction list for the detail table
      prisma.transaction.findMany({
        where,
        select: {
          id: true,
          transactionCode: true,
          codeType: true,
          cadAmount: true,
          ghsAmount: true,
          paymentMethod: true,
          receivingMode: true,
          status: true,
          transactionDate: true,
          createdAt: true,
          sender: { select: { firstName: true, lastName: true } },
          receiver: { select: { firstName: true, lastName: true } },
          receivingPoint: { select: { name: true, code: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...(includeAll ? {} : { skip: (page - 1) * limit, take: limit }),
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.aggregate({ where, _sum: { cadAmount: true } }),
      prisma.transaction.aggregate({ where, _sum: { ghsAmount: true } }),
      prisma.transaction.groupBy({ by: ['status'], where, _count: { _all: true } }),
      // DB-level groupBy for receiving mode
      prisma.transaction.groupBy({
        by: ['receivingMode'],
        where,
        _count: { _all: true },
        _sum: { cadAmount: true, ghsAmount: true },
      }),
      // DB-level groupBy for payment method
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where,
        _count: { _all: true },
        _sum: { cadAmount: true },
      }),
      // DB-level groupBy for code type
      prisma.transaction.groupBy({
        by: ['codeType'],
        where,
        _count: { _all: true },
        _sum: { cadAmount: true },
      }),
    ]);

    // Branch grouping still needs a join — do it only over the current page to avoid over-fetching.
    // For accurate branch totals across all pages use the aggregate query below.
    const branchAgg = await prisma.transaction.findMany({
      where,
      select: {
        cadAmount: true,
        ghsAmount: true,
        receivingPoint: { select: { name: true, code: true } },
      },
    });
    const byBranch: Record<string, { name: string; count: number; totalCAD: number; totalGHS: number }> = {};
    for (const t of branchAgg) {
      const branch = t.receivingPoint?.name || 'Unknown';
      if (!byBranch[branch]) byBranch[branch] = { name: branch, count: 0, totalCAD: 0, totalGHS: 0 };
      byBranch[branch].count++;
      byBranch[branch].totalCAD += Number(t.cadAmount);
      byBranch[branch].totalGHS += Number(t.ghsAmount);
    }

    return successResponse({
      summary: {
        totalTransactions: totalCount,
        totalCAD: totalCAD._sum.cadAmount || 0,
        totalGHS: totalGHS._sum.ghsAmount || 0,
        byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
      },
      byBranch: Object.values(byBranch),
      byReceivingMode: byModeCounts.map((r) => ({
        mode: r.receivingMode,
        count: r._count._all,
        totalCAD: r._sum.cadAmount || 0,
        totalGHS: r._sum.ghsAmount || 0,
      })),
      byPaymentMethod: byPaymentMethodCounts.map((r) => ({
        method: r.paymentMethod,
        count: r._count._all,
        totalCAD: r._sum.cadAmount || 0,
      })),
      byCodeType: byCodeTypeCounts.map((r) => ({
        type: r.codeType,
        count: r._count._all,
        totalCAD: r._sum.cadAmount || 0,
      })),
      transactions,
      pagination: {
        page,
        limit: includeAll ? totalCount : limit,
        total: totalCount,
        totalPages: includeAll ? 1 : Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Agent report error:', error);
    return errorResponse('Failed to generate report');
  }
}
