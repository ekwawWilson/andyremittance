import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const transferSchema = z.object({
  vaultId: z.string().uuid(),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

// POST — teller requests a vault-to-till transfer (creates PENDING request; receiving admin must approve)
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_TELLER_TILL');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    // Prefer the receivingPointId from the JWT; fall back to the DB so requests
    // are always branch-tagged even when the token was issued before the field
    // was added or when the session predates a branch assignment change.
    let receivingPointId = check.ctx.receivingPointId ?? undefined;
    if (!receivingPointId) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { receivingPointId: true } });
      receivingPointId = u?.receivingPointId ?? undefined;
    }

    const body = await request.json();
    const { vaultId, amount, notes } = transferSchema.parse(body);

    // Verify vault and check funds
    const vault = await prisma.ledgerAccount.findUnique({ where: { id: vaultId } });
    if (!vault || vault.accountType !== 'COMPANY_VAULT') {
      return errorResponse('Invalid vault account', 400);
    }
    if (Number(vault.balance) === 0) {
      return errorResponse('Vault has no funds available for transfer', 400);
    }
    if (Number(vault.balance) < amount) {
      return errorResponse(
        `Insufficient vault balance. Available: GHS ${Number(vault.balance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
        400
      );
    }

    // Get or create teller till
    let tellerTill = await prisma.ledgerAccount.findFirst({
      where: { accountType: 'TELLER_TILL', userId },
    });
    if (!tellerTill) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      tellerTill = await prisma.ledgerAccount.create({
        data: {
          accountType: 'TELLER_TILL',
          accountName: `Till - ${user?.firstName} ${user?.lastName}`,
          accountCode: `TILL-${userId}`,
          userId,
          currency: 'GHS',
        },
      });
    }

    // Create PENDING transfer request — no ledger movement until admin approves
    const transferRequest = await prisma.cashTransferRequest.create({
      data: {
        fromAccountId: vaultId,
        toAccountId: tellerTill.id,
        amount,
        notes,
        requestedById: userId,
        receivingPointId,
      },
      include: {
        fromAccount: { select: { accountName: true, accountCode: true } },
        toAccount: { select: { accountName: true, accountCode: true } },
      },
    });

    return successResponse(transferRequest, 'Transfer request submitted — awaiting admin approval');
  } catch (error) {
    console.error('Vault to self-till request error:', error);
    const message = error instanceof Error ? error.message : 'Transfer request failed';
    return errorResponse(message);
  }
}
