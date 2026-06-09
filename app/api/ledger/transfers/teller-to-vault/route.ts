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

// POST /api/ledger/transfers/teller-to-vault
// Creates a PENDING CashTransferRequest (teller → vault direction).
// A receiving admin must approve it before the ledger moves, giving full
// auditability and preventing unilateral cash removal from the till.
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

    // Verify destination vault
    const vault = await prisma.ledgerAccount.findUnique({ where: { id: vaultId } });
    if (!vault || vault.accountType !== 'COMPANY_VAULT') {
      return errorResponse('Invalid vault account', 400);
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
          accountCode: `TILL-${userId}`,   // full UUID — no collision risk
          userId,
          currency: 'GHS',
        },
      });
    }

    // Soft balance check — admin will do the hard check at approval time,
    // but warn early if the teller clearly doesn't have enough.
    if (Number(tellerTill.balance) < amount) {
      return errorResponse(
        `Insufficient till balance. Current balance: GHS ${Number(tellerTill.balance).toFixed(2)}`,
        400
      );
    }

    // fromAccount = teller till, toAccount = vault (money flows teller → vault)
    const transferRequest = await prisma.cashTransferRequest.create({
      data: {
        fromAccountId: tellerTill.id,
        toAccountId: vaultId,
        amount,
        notes,
        requestedById: userId,
        receivingPointId,
      },
      include: {
        fromAccount: { select: { accountName: true, accountCode: true, balance: true } },
        toAccount: { select: { accountName: true, accountCode: true, balance: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return successResponse(transferRequest, 'Return request submitted — awaiting admin approval');
  } catch (error) {
    console.error('Teller to vault request error:', error);
    const message = error instanceof Error ? error.message : 'Transfer request failed';
    return errorResponse(message);
  }
}
