import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const loadSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  source: z.enum(['BANK_WITHDRAWAL', 'CASH_BROUGHT_IN', 'AGENT_DEPOSIT', 'OTHER']),
  notes: z.string().optional(),
});

const ledgerService = new LedgerService();

// POST /api/ledger/till/load — teller loads cash into their own till from an external source
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_TELLER_TILL');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    const body = await request.json();
    const { amount, source, notes } = loadSchema.parse(body);

    // Use the branch's business server date so ledger entries are stamped on the
    // correct business day (reconciliation queries by this date, not wall clock).
    let entryDate: Date | undefined;
    if (receivingPointId) {
      const rp = await prisma.receivingPoint.findUnique({
        where: { id: receivingPointId },
        select: { serverDate: true },
      });
      if (rp?.serverDate) entryDate = new Date(rp.serverDate);
    }

    const entry = await ledgerService.loadTillFromExternal(userId, amount, source, notes, userId, entryDate);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TILL_LOAD_EXTERNAL',
        entity: 'LedgerEntry',
        entityId: entry.id,
        changes: JSON.parse(JSON.stringify({ amount, source, notes })),
      },
    });

    return successResponse(entry, `GHS ${amount.toFixed(2)} loaded into till from ${source}`);
  } catch (error) {
    console.error('Till load error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load till';
    return errorResponse(message);
  }
}
