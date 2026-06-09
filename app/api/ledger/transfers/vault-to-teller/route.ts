import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';

const transferSchema = z.object({
  vaultId: z.string().uuid(),
  tellerId: z.string().uuid(),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

const ledgerService = new LedgerService();

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_VAULT_TRANSFERS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    const body = await request.json();
    const validatedData = transferSchema.parse(body);

    let entryDate: Date | undefined;
    if (receivingPointId) {
      const rp = await prisma.receivingPoint.findUnique({
        where: { id: receivingPointId },
        select: { serverDate: true },
      });
      if (rp?.serverDate) entryDate = new Date(rp.serverDate);
    }

    const entry = await ledgerService.vaultToTeller(
      validatedData.vaultId,
      validatedData.tellerId,
      validatedData.amount,
      userId,
      validatedData.notes,
      undefined,
      undefined,
      undefined,
      entryDate
    );

    return successResponse(entry, 'Transfer completed successfully');
  } catch (error) {
    console.error('Vault to teller transfer error:', error);
    const message = error instanceof Error ? error.message : 'Transfer failed';
    return errorResponse(message);
  }
}
