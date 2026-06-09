import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/reports/closing-balances?date=2026-02-05
// Returns the logged-in agent's closing balances for the given date (defaults to today).
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')!;
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // transactionDate is stored at midnight UTC — match the full calendar day
    const dayStart = new Date(dateParam);
    const dayEnd = new Date(dateParam);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const where = {
      createdById: userId,
      transactionDate: { gte: dayStart, lt: dayEnd },
      status: { not: 'CANCELLED' as const },
    };

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { firstName: true, lastName: true } },
        receivingPoint: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate in a single pass
    let totalCAD = 0, totalGHS = 0;
    let totalCashCAD = 0, totalETransferCAD = 0, totalSplitCAD = 0;
    let totalPaidCAD = 0, totalOwingCAD = 0;

    const senderMap = new Map<string, {
      senderId: string;
      senderName: string;
      transactions: number;
      totalCAD: number;
      paidCAD: number;
      owingCAD: number;
    }>();

    for (const t of transactions) {
      const cad = Number(t.cadAmount);
      const ghs = Number(t.ghsAmount);
      const paid = Number(t.amountPaidCAD);
      const owing = Number(t.amountPendingCAD);

      totalCAD += cad;
      totalGHS += ghs;
      totalPaidCAD += paid;
      totalOwingCAD += owing;

      if (t.paymentMethod === 'CASH') totalCashCAD += cad;
      else if (t.paymentMethod === 'E_TRANSFER') totalETransferCAD += cad;
      else totalSplitCAD += cad;

      const existing = senderMap.get(t.senderId);
      if (existing) {
        existing.transactions++;
        existing.totalCAD += cad;
        existing.paidCAD += paid;
        existing.owingCAD += owing;
      } else {
        senderMap.set(t.senderId, {
          senderId: t.senderId,
          senderName: `${t.sender.firstName} ${t.sender.lastName}`,
          transactions: 1,
          totalCAD: cad,
          paidCAD: paid,
          owingCAD: owing,
        });
      }
    }

    return successResponse({
      date: dateParam,
      summary: {
        totalTransactions: transactions.length,
        totalCAD,
        totalGHS,
        totalCashCAD,
        totalETransferCAD,
        totalSplitCAD,
        totalPaidCAD,
        totalOwingCAD,
      },
      bySender: Array.from(senderMap.values()).sort((a, b) => b.owingCAD - a.owingCAD),
      transactions,
    });
  } catch (error) {
    console.error('Closing balances error:', error);
    return errorResponse('Failed to generate closing balances');
  }
}
