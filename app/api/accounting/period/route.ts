import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const createPeriodSchema = z.object({
  periodYear:      z.number().int().min(2020).max(2100),
  periodMonth:     z.number().int().min(1).max(12),
  receivingPointId: z.string().uuid().optional().nullable(),
});

// GET /api/accounting/period — list accounting periods
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_REPORTS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const status           = searchParams.get('status');
    const year             = searchParams.get('year');

    const where: Record<string, unknown> = {};
    if (status)    where.status = status;
    if (year)      where.periodYear = Number(year);
    if (receivingPointId !== null) {
      if (receivingPointId) where.receivingPointId = receivingPointId;
    }

    const periods = await prisma.accountingPeriod.findMany({
      where,
      include: {
        receivingPoint: { select: { name: true, code: true } },
        closedBy:       { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });

    return successResponse(periods);
  } catch (error) {
    console.error('Period list error:', error);
    return errorResponse('Failed to fetch accounting periods');
  }
}

// POST /api/accounting/period — open a new accounting period
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_LEDGER_ACCOUNTS');
    if (check.denied) return check.response;

    const body      = await request.json();
    const validated = createPeriodSchema.parse(body);

    const { periodYear, periodMonth, receivingPointId } = validated;
    const scopedReceivingPointId = getScopedReceivingPointId(request, receivingPointId ?? null);

    // Check for duplicate
    const existing = await prisma.accountingPeriod.findFirst({
      where: {
        periodYear,
        periodMonth,
        receivingPointId: scopedReceivingPointId ?? null,
      },
    });
    if (existing) return errorResponse('Accounting period already exists for this month', 409);

    // Calculate start/end dates
    const startDate = new Date(periodYear, periodMonth - 1, 1);
    const endDate   = new Date(periodYear, periodMonth, 0); // last day of month

    const period = await prisma.accountingPeriod.create({
      data: {
        periodYear,
        periodMonth,
        startDate,
        endDate,
        status: 'OPEN',
        receivingPointId: scopedReceivingPointId ?? null,
      },
      include: {
        receivingPoint: { select: { name: true, code: true } },
      },
    });

    return successResponse(period, `Period ${periodYear}-${String(periodMonth).padStart(2, '0')} opened`);
  } catch (error) {
    console.error('Create period error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create period';
    return errorResponse(message);
  }
}
