import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/transactions/sub-payment-report?startDate=&endDate=&receivingPointId=
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MARK_PAID');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const rpId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));

    const where: Record<string, unknown> = {};

    if (rpId) where.receivingPointId = rpId;

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate) dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
      where.paidAt = dateFilter;
    }

    const subPayments = await prisma.subPayment.findMany({
      where,
      include: {
        transaction: {
          select: {
            transactionCode: true,
            ghsAmount: true,
            status: true,
            receivingMode: true,
            sender: { select: { firstName: true, lastName: true } },
            receiver: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });

    const totalDisbursed = subPayments.reduce((s, sp) => s + Number(sp.ghsAmount), 0);

    return successResponse({
      subPayments,
      totalDisbursed,
      count: subPayments.length,
    });
  } catch (error) {
    console.error('Sub-payment report error:', error);
    return errorResponse('Failed to fetch sub-payment report');
  }
}
