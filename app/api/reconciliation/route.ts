import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const reconciliationSchema = z.object({
  reconciliationDate: z.string(),
  actualClosing: z.number().min(0),
  notes: z.string().optional(),
});

function normalizeBusinessDateInput(input: string) {
  const dateOnly = input.trim().includes('T')
    ? input.trim().slice(0, 10)
    : input.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error('Reconciliation date must be in YYYY-MM-DD format');
  }

  return dateOnly;
}

function getBusinessDayBounds(input: string) {
  // Always use UTC so these bounds agree with till/status which also uses UTC.
  const businessDate = new Date(input + 'T00:00:00.000Z');
  const nextDay = new Date(businessDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayEnd = new Date(nextDay.getTime() - 1);
  return { businessDate, nextDay, dayEnd };
}

async function deriveTellerLedgerFigures(
  tellerId: string,
  businessDate: Date,
  dayEnd: Date
) {
  const till = await prisma.ledgerAccount.findFirst({
    where: {
      accountType: 'TELLER_TILL',
      userId: tellerId,
    },
    select: {
      id: true,
    },
  });

  if (!till) {
    throw new Error('Teller till not found');
  }

  const lastResolvedRecon = await prisma.tellerReconciliation.findFirst({
    where: {
      tellerId,
      reconciliationDate: { lt: businessDate },
      status: { in: ['COMPLETED', 'APPROVED'] },
    },
    orderBy: [
      { reconciliationDate: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      actualClosing: true,
    },
  });

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      OR: [
        { debitAccountId: till.id },
        { creditAccountId: till.id },
      ],
      entryDate: {
        gte: businessDate,
        lte: dayEnd,
      },
    },
    select: {
      amount: true,
      entryType: true,
      debitAccountId: true,
      creditAccountId: true,
    },
    orderBy: [
      { entryDate: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  const openingBalance = Number(lastResolvedRecon?.actualClosing ?? 0);

  let transfersIn = 0;
  let paymentsMade = 0;
  let returnsToVault = 0;
  let netMovement = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount);
    const isDebit = entry.debitAccountId === till.id;

    netMovement += isDebit ? amount : -amount;

    if (entry.entryType === 'DISBURSEMENT') {
      paymentsMade += amount;
    } else if (entry.entryType === 'TRANSFER') {
      if (isDebit) transfersIn += amount;
      else returnsToVault += amount;
    } else if (entry.entryType === 'LOAD' && isDebit) {
      // External cash loads into the till count as cash-in (same bucket as vault transfers).
      transfersIn += amount;
    }
    // RECONCILIATION variance adjustments are intentionally excluded from the
    // breakdown — they correct the prior day's balance, not today's movements.
  }

  return {
    openingBalance,
    vaultTransfersIn: transfersIn,
    paymentsMade,
    returnsToVault,
    expectedClosing: openingBalance + netMovement,
  };
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'CREATE_RECONCILIATION');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    if (!receivingPointId) {
      return errorResponse('Receiving point not specified', 400);
    }

    const body = await request.json();
    const validatedData = reconciliationSchema.parse(body);
    const businessDateInput = normalizeBusinessDateInput(
      validatedData.reconciliationDate
    );

    const { businessDate, nextDay, dayEnd } = getBusinessDayBounds(
      businessDateInput
    );

    // Guard: block duplicate submissions only when already APPROVED.
    // Allow resubmission when REJECTED (supervisor asked for correction),
    // PENDING (teller wants to update figures before supervisor reviews),
    // or COMPLETED (teller self-corrects a balanced submission — rare but valid).
    // APPROVED is the only terminal state that cannot be overwritten.
    const latestForDay = await prisma.tellerReconciliation.findFirst({
      where: {
        tellerId: userId,
        reconciliationDate: { gte: businessDate, lt: nextDay },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestForDay && latestForDay.status === 'APPROVED') {
      return errorResponse('This reconciliation has already been approved and cannot be resubmitted', 400);
    }

    const derived = await deriveTellerLedgerFigures(userId, businessDate, dayEnd);
    const variance = validatedData.actualClosing - derived.expectedClosing;
    const status: 'COMPLETED' | 'PENDING' =
      Math.abs(variance) < 0.001 ? 'COMPLETED' : 'PENDING';
    const reconciliationData = {
      tellerId: userId,
      receivingPointId,
      reconciliationDate: businessDate,
      openingBalance: derived.openingBalance,
      vaultTransfersIn: derived.vaultTransfersIn,
      paymentsMade: derived.paymentsMade,
      returnsToVault: derived.returnsToVault,
      expectedClosing: derived.expectedClosing,
      actualClosing: validatedData.actualClosing,
      variance,
      status,
      notes: validatedData.notes,
    };

    const reconciliation = latestForDay
      ? await prisma.tellerReconciliation.update({
          where: { id: latestForDay.id },
          data: {
            ...reconciliationData,
            approvedBy: null,
            approvedByName: null,
            approvedAt: null,
            varianceJournalEntryId: null,
          },
        })
      : await prisma.tellerReconciliation.create({
          data: reconciliationData,
        });

    return successResponse(
      reconciliation,
      status === 'COMPLETED'
        ? latestForDay
          ? 'Reconciliation updated - balanced'
          : 'Reconciliation completed - balanced'
        : latestForDay
          ? `Reconciliation updated. Discrepancy detected (GHS ${variance.toFixed(2)}). Supervisor approval required.`
          : `Discrepancy detected (GHS ${variance.toFixed(2)}). Supervisor approval required.`
    );
  } catch (error) {
    console.error('Reconciliation error:', error);
    const message = error instanceof Error ? error.message : 'Reconciliation failed';
    return errorResponse(message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_RECONCILIATIONS');
    if (check.denied) return check.response;
    const { userId, userRole } = check.ctx;

    const { searchParams } = new URL(request.url);
    const tellerId = searchParams.get('tellerId');
    const receivingPointId = getScopedReceivingPointId(
      request,
      searchParams.get('receivingPointId')
    );
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');

    const where: Prisma.TellerReconciliationWhereInput = {};

    if (userRole === 'TELLER') {
      where.tellerId = userId;
    } else if (tellerId) {
      where.tellerId = tellerId;
    }
    if (receivingPointId) where.receivingPointId = receivingPointId;
    if (status) where.status = status as Prisma.EnumReconciliationStatusFilter;

    if (startDate || endDate) {
      where.reconciliationDate = {};
      if (startDate) where.reconciliationDate.gte = new Date(startDate);
      if (endDate) where.reconciliationDate.lte = new Date(endDate);
    }

    const reconciliations = await prisma.tellerReconciliation.findMany({
      where,
      include: {
        teller: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        receivingPoint: {
          select: {
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { reconciliationDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return successResponse(reconciliations);
  } catch (error) {
    console.error('Get reconciliations error:', error);
    return errorResponse('Failed to fetch reconciliations');
  }
}
