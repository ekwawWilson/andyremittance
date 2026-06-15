import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureReceivingPointAccess, requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const ledgerService = new LedgerService();

// Each allocation the teller submits — either link to existing receiver or inline name/phone
const allocationSchema = z.object({
  receiverId: z.string().optional(),      // existing receiver record
  receiverName: z.string().optional(),    // inline (deferred transactions)
  receiverPhone: z.string().optional(),   // inline (deferred transactions)
  ghsAmount: z.number().positive(),
  notes: z.string().optional(),
});

const disburseSchema = z.object({
  transactionId: z.string().min(1),
  allocations: z.array(allocationSchema).min(1),
});

// POST /api/transactions/multi-receiver/disburse
// Called by the teller to assign receivers + amounts and mark the whole transaction PAID
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MARK_PAID');
    if (check.denied) return check.response;
    const tellerId = check.ctx.userId;

    const body = await request.json();
    const parsed = disburseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid request', 400);
    }

    const { transactionId, allocations } = parsed.data;

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { transactionReceivers: true },
    });

    if (!transaction) return errorResponse('Transaction not found', 404);
    const accessError = ensureReceivingPointAccess(
      request,
      transaction.receivingPointId,
      'Cannot disburse transactions for another receiving point'
    );
    if (accessError) return accessError;
    if (transaction.status !== 'SYNCED') {
      return errorResponse('Transaction must be in SYNCED status to disburse', 400);
    }

    // Validate total GHS — allocations must match transaction amount (±1 pesewa)
    const totalGHS = Number(transaction.ghsAmount);
    const sumAllocated = allocations.reduce((s, a) => s + a.ghsAmount, 0);
    if (Math.abs(sumAllocated - totalGHS) > 0.01) {
      return errorResponse(
        `Allocated GHS (${sumAllocated.toFixed(2)}) does not match transaction GHS (${totalGHS.toFixed(2)}). All funds must be allocated.`,
        400
      );
    }

    // Validate deferred allocations
    if (transaction.receiversDeferred) {
      for (const a of allocations) {
        if (!a.receiverName && !a.receiverId) {
          return errorResponse('Each allocation must have a receiver name or an existing receiver ID', 400);
        }
      }

      // Duplicate check: same receiverId used twice, or same name+phone combination used twice
      const seenKeys = new Set<string>();
      for (const a of allocations) {
        const key = a.receiverId
          ? `id:${a.receiverId}`
          : `name:${(a.receiverName ?? '').toLowerCase().trim()}|phone:${(a.receiverPhone ?? '').trim()}`;
        if (seenKeys.has(key)) {
          return errorResponse(
            `Duplicate receiver in allocations: "${a.receiverName ?? a.receiverId}". Each receiver may only appear once.`,
            400
          );
        }
        seenKeys.add(key);
      }

      const receiverIds = Array.from(
        new Set(
          allocations
            .map((allocation) => allocation.receiverId)
            .filter((receiverId): receiverId is string => !!receiverId)
        )
      );

      if (receiverIds.length > 0) {
        const receivers = await prisma.receiver.findMany({
          where: { id: { in: receiverIds } },
          select: { id: true, senderId: true },
        });

        if (receivers.length !== receiverIds.length) {
          return errorResponse('One or more selected receivers no longer exist', 400);
        }

        const invalidReceiver = receivers.find(
          (receiver) => receiver.senderId !== transaction.senderId
        );
        if (invalidReceiver) {
          return errorResponse(
            'Selected receivers must belong to the original sender for this transaction',
            400
          );
        }
      }
    }

    // Fetch teller name
    const teller = await prisma.user.findUnique({
      where: { id: tellerId },
      select: { firstName: true, lastName: true },
    });
    const tellerName = teller ? `${teller.firstName} ${teller.lastName}` : 'Teller';

    const now = new Date();

    if (transaction.receiversDeferred) {
      // Deferred: create TransactionReceiver rows from teller's allocations.
      // Ledger debit is included inside the same DB transaction so receiver
      // records + status update + till debit are all-or-nothing.
      await prisma.$transaction(async (tx) => {
        // Remove any previous draft allocations (shouldn't exist, but be safe)
        await tx.transactionReceiver.deleteMany({ where: { transactionId } });

        await tx.transactionReceiver.createMany({
          data: allocations.map((a) => ({
            transactionId,
            receiverId: a.receiverId ?? null,
            receiverName: a.receiverName ?? null,
            receiverPhone: a.receiverPhone ?? null,
            ghsAmount: a.ghsAmount,
            notes: a.notes ?? null,
            isPaid: true,
            paidAt: now,
            paidByName: tellerName,
          })),
        });

        // Ledger write BEFORE status update: a journal/period error here rolls
        // back the entire transaction before the status is ever set to PAID.
        await ledgerService.recordDisbursement(
          transactionId,
          tellerId,
          totalGHS,
          tellerId,
          tx,
          transaction.receivingMode,
          transaction.receivingPointId,
          transaction.transactionCode,
          transaction.codeType
        );

        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'PAID',
            paidAt: now,
            paidBy: tellerId,
            paidByName: tellerName,
          },
        });
      });
    } else {
      // Pre-assigned receivers: mark each allocation as paid.
      const existingIds = transaction.transactionReceivers.map((tr) => tr.id);

      if (allocations.length !== existingIds.length) {
        return errorResponse(
          `Expected ${existingIds.length} allocations, got ${allocations.length}`,
          400
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.transactionReceiver.updateMany({
          where: { transactionId },
          data: { isPaid: true, paidAt: now, paidByName: tellerName },
        });

        // Ledger write BEFORE status update: a journal/period error here rolls
        // back the entire transaction before the status is ever set to PAID.
        await ledgerService.recordDisbursement(
          transactionId,
          tellerId,
          totalGHS,
          tellerId,
          tx,
          transaction.receivingMode,
          transaction.receivingPointId,
          transaction.transactionCode,
          transaction.codeType
        );

        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'PAID',
            paidAt: now,
            paidBy: tellerId,
            paidByName: tellerName,
          },
        });
      });
    }

    void Promise.all([
      prisma.auditLog.create({
        data: {
          userId: tellerId,
          userName: tellerName,
          action: 'DISBURSE_MULTI_RECEIVER',
          entity: 'Transaction',
          entityId: transactionId,
          changes: JSON.parse(JSON.stringify({
            transactionCode: transaction.transactionCode,
            allocationCount: allocations.length,
            totalGHS,
            tellerName,
            allocations: allocations.map((a) => ({
              receiverId: a.receiverId ?? null,
              receiverName: a.receiverName ?? null,
              receiverPhone: a.receiverPhone ?? null,
              ghsAmount: a.ghsAmount,
            })),
          })),
        },
      }),
      prisma.notification.updateMany({
        where: { transactionId, isRead: false },
        data: { isRead: true },
      }),
    ]).catch((e) => console.error('Post-payment cleanup error:', e));

    const updated = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        sender: true,
        receiver: true,
        receivingPoint: true,
        transactionReceivers: { include: { receiver: true } },
      },
    });

    return successResponse(updated, 'Multi-receiver transaction disbursed successfully');
  } catch (error) {
    console.error('Multi-receiver disburse error:', error);
    const message = error instanceof Error ? error.message : 'Failed to disburse transaction';
    return errorResponse(message);
  }
}
