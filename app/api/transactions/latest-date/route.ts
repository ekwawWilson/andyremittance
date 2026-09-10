/**
 * GET /api/transactions/latest-date
 *
 * Returns the business date of the most recent transaction the caller can see.
 *
 * Date filters across the portals used to default to either the branch's
 * serverDate or the wall-clock date. Both go stale — a branch that has not run
 * EOD sits on an old business date, and imported day-sheets carry the sending
 * side's date — so pages opened to an empty list even with work waiting. Landing
 * on the latest date that actually has transactions means the default view is
 * never empty when there is something to show.
 *
 * Branch-scoped users only ever see their own branch's latest date.
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma, TransactionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const receivingPointId = getScopedReceivingPointId(
      request,
      searchParams.get('receivingPointId')
    );

    // Optional: narrow to the statuses a given screen actually lists, so a
    // pending page lands on the last day with pending work rather than the last
    // day with any activity at all.
    const statusParam = searchParams.get('status');
    const statuses = statusParam
      ? statusParam
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s): s is TransactionStatus => s in TransactionStatus)
      : [];

    const where: Prisma.TransactionWhereInput = {
      ...(receivingPointId ? { receivingPointId } : {}),
      ...(statuses.length ? { status: { in: statuses } } : {}),
    };

    const latest = await prisma.transaction.aggregate({
      where,
      _max: { transactionDate: true },
    });

    const date = latest._max.transactionDate;

    return successResponse({
      latestDate: date ? date.toISOString().slice(0, 10) : null,
      receivingPointId: receivingPointId ?? null,
    });
  } catch (error) {
    console.error('Latest transaction date error:', error);
    return errorResponse('Failed to load the latest transaction date');
  }
}
