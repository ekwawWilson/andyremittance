import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'MANAGE_VAULT_TRANSFERS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    const { id } = await params;

    // Pre-flight: resolve approver name + branch server date before entering the DB transaction
    const [approver, rpRecord] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      }),
      receivingPointId
        ? prisma.receivingPoint.findUnique({
            where: { id: receivingPointId },
            select: { serverDate: true },
          })
        : null,
    ]);
    const approverName = approver ? `${approver.firstName} ${approver.lastName}` : 'Admin';
    const entryDate = rpRecord?.serverDate ? new Date(rpRecord.serverDate) : undefined;

    // All status checks, direction validation, ledger movement, and request update
    // happen inside a single $transaction.  SELECT FOR UPDATE on the request row
    // prevents two concurrent admin clicks from both reading PENDING and both
    // executing the ledger transfer.
    const updated = await prisma.$transaction(async (tx) => {
      // Lock the request row before reading status
      const locked = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        amount: string;
        notes: string | null;
        receivingPointId: string | null;
        fromAccountId: string;
        toAccountId: string;
      }>>`
        SELECT id, status, amount, notes, "receivingPointId", "fromAccountId", "toAccountId"
        FROM "CashTransferRequest"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const req = locked[0];
      if (!req) throw new Error('Transfer request not found');
      if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status.toLowerCase()}`);

      if (receivingPointId && req.receivingPointId && req.receivingPointId !== receivingPointId) {
        throw new Error('Not authorised to approve requests from another branch');
      }

      // Resolve account types inside the lock
      const [fromAccount, toAccount] = await Promise.all([
        tx.ledgerAccount.findUnique({
          where: { id: req.fromAccountId },
          select: { id: true, accountType: true, userId: true },
        }),
        tx.ledgerAccount.findUnique({
          where: { id: req.toAccountId },
          select: { id: true, accountType: true, userId: true },
        }),
      ]);

      if (!fromAccount || !toAccount) throw new Error('Transfer accounts not found');

      const isVaultToTeller = fromAccount.accountType === 'COMPANY_VAULT' && toAccount.accountType === 'TELLER_TILL';
      const isTellerToVault = fromAccount.accountType === 'TELLER_TILL'   && toAccount.accountType === 'COMPANY_VAULT';

      if (!isVaultToTeller && !isTellerToVault) throw new Error('Unsupported transfer direction on this request');

      if (isVaultToTeller) {
        if (!toAccount.userId) throw new Error('Teller till has no associated user');
        await ledgerService.vaultToTeller(
          req.fromAccountId,
          toAccount.userId,
          Number(req.amount),
          userId,
          req.notes ?? undefined,
          tx,
          undefined,
          undefined,
          entryDate
        );
      } else {
        if (!fromAccount.userId) throw new Error('Teller till has no associated user');
        await ledgerService.tellerToVault(
          fromAccount.userId,
          req.toAccountId,
          Number(req.amount),
          userId,
          req.notes ?? undefined,
          tx,
          undefined,
          undefined,
          entryDate
        );
      }

      return tx.cashTransferRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedByName: approverName,
          approvedAt: new Date(),
        },
        include: {
          fromAccount: { select: { accountName: true, accountCode: true, balance: true } },
          toAccount:   { select: { accountName: true, accountCode: true, balance: true } },
          requestedBy: { select: { firstName: true, lastName: true } },
        },
      });
    });

    void prisma.auditLog.create({
      data: {
        userId,
        action: 'APPROVE_CASH_TRANSFER',
        entity: 'CashTransferRequest',
        entityId: id,
        changes: JSON.parse(JSON.stringify({ amount: Number(updated.amount), approvedBy: approverName })),
      },
    }).catch((e) => console.error('Audit log error:', e));

    return successResponse(updated, `Transfer of GHS ${Number(updated.amount).toFixed(2)} approved`);
  } catch (error) {
    console.error('Approve transfer error:', error);
    const message = error instanceof Error ? error.message : 'Failed to approve transfer';
    // Propagate branch-scope and already-processed errors as 400/403 rather than 500
    const status = message.includes('Not authorised') ? 403
      : message.includes('already') || message.includes('not found') || message.includes('Insufficient') || message.includes('no funds') ? 400
      : 500;
    return errorResponse(message, status);
  }
}
