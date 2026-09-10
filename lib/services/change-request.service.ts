/**
 * change-request.service — reversing or amending a transaction after the fact.
 *
 * A teller who pays the wrong person, or pays twice, cannot simply undo it: the
 * cash has left the till and the branch payable has been settled. Raising a
 * request records the intent and moves nothing. Only an approver with
 * APPROVE_TRANSACTION_CHANGE can make the ledger move, so no one can quietly
 * unwind their own disbursement.
 *
 * Reversing a disbursement puts everything back exactly as it was:
 *
 *   Dr TELLER_TILL / ADDITIONAL_TILL      the cash returns to the drawer
 *     Cr DISBURSE-EXPENSE                 the expense is undone
 *   PAYABLE-GHS-{branch} += amount        the branch is owed the money again
 *   transaction → SYNCED                  it is payable once more
 *
 * Journals are never edited or deleted — JournalService.reverseJournalEntry
 * writes a mirrored counter-entry and marks the original REVERSED, so the audit
 * trail shows both the payment and its undoing.
 */

import prisma from '@/lib/db/prisma';
import { PrismaClient, Prisma, ChangeRequestType, ChangeRequestStatus } from '@prisma/client';
import { JournalService } from '@/lib/services/journal.service';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const journalService = new JournalService();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RaiseInput {
  transactionId: string;
  type: ChangeRequestType;
  reason: string;
  /** TRANSACTION_EDIT only — the fields the requester wants changed. */
  proposedChanges?: Record<string, unknown>;
  actor: { userId: string; userName: string };
}

export interface ReviewInput {
  requestId: string;
  note?: string;
  actor: { userId: string; userName: string; userRole: string };
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Fields an approved TRANSACTION_EDIT is allowed to touch. */
const EDITABLE_FIELDS = [
  'bankName',
  'bankAccountNo',
  'bankAccountName',
  'bankBranch',
  'momoNumber',
  'momoName',
  'cashPhoneNumber',
  'cashGhanaCardNumber',
  'receivingMode',
  'notes',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

// ─── Service ─────────────────────────────────────────────────────────────────

export class ChangeRequestService {
  /** Raise a request. Nothing moves — this only records what someone wants done. */
  async raise(input: RaiseInput) {
    const tx = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
      include: {
        sender: { select: { firstName: true, lastName: true } },
        receiver: { select: { firstName: true, lastName: true } },
      },
    });
    if (!tx) throw new Error('Transaction not found.');

    if (!input.reason?.trim()) throw new Error('A reason is required.');

    // What can be asked for depends on where the transaction currently is.
    if (input.type === 'DISBURSEMENT_REVERSAL') {
      if (!['PAID', 'PARTIAL_PAYMENT'].includes(tx.status)) {
        throw new Error(
          `Only a disbursed transaction can be reversed — ${tx.transactionCode} is ${tx.status}.`
        );
      }
    }
    if (input.type === 'TRANSACTION_CANCEL' && tx.status === 'CANCELLED') {
      throw new Error(`${tx.transactionCode} is already cancelled.`);
    }
    if (input.type === 'TRANSACTION_EDIT') {
      const keys = Object.keys(input.proposedChanges ?? {});
      if (keys.length === 0) throw new Error('No changes were proposed.');
      const invalid = keys.filter((k) => !(EDITABLE_FIELDS as readonly string[]).includes(k));
      if (invalid.length) throw new Error(`These fields cannot be edited: ${invalid.join(', ')}`);
    }

    // One open request at a time, so two approvers cannot both act on the same thing.
    const open = await prisma.transactionChangeRequest.findFirst({
      where: { transactionId: input.transactionId, status: 'PENDING' },
      select: { id: true, type: true },
    });
    if (open) {
      throw new Error(`A ${open.type.replace(/_/g, ' ').toLowerCase()} request is already awaiting approval for this transaction.`);
    }

    return prisma.transactionChangeRequest.create({
      data: {
        transactionId: tx.id,
        type: input.type,
        reason: input.reason.trim(),
        proposedChanges: (input.proposedChanges ?? undefined) as Prisma.InputJsonValue | undefined,
        snapshot: {
          transactionCode: tx.transactionCode,
          status: tx.status,
          ghsAmount: Number(tx.ghsAmount),
          cadAmount: Number(tx.cadAmount),
          receivingMode: tx.receivingMode,
          sender: `${tx.sender.firstName} ${tx.sender.lastName}`.trim(),
          receiver: tx.receiver ? `${tx.receiver.firstName} ${tx.receiver.lastName}`.trim() : null,
          paidAt: tx.paidAt?.toISOString() ?? null,
          paidByName: tx.paidByName,
        } as Prisma.InputJsonValue,
        requestedById: input.actor.userId,
        requestedByName: input.actor.userName,
        receivingPointId: tx.receivingPointId,
      },
      include: { transaction: { select: { transactionCode: true } } },
    });
  }

  /** Reject a request. Nothing on the transaction changes. */
  async reject(input: ReviewInput) {
    const req = await prisma.transactionChangeRequest.findUnique({ where: { id: input.requestId } });
    if (!req) throw new Error('Request not found.');
    if (req.status !== 'PENDING') throw new Error(`This request is already ${req.status.toLowerCase()}.`);
    if (!input.note?.trim()) throw new Error('A reason is required when rejecting.');

    return prisma.transactionChangeRequest.update({
      where: { id: req.id },
      data: {
        status: ChangeRequestStatus.REJECTED,
        reviewedById: input.actor.userId,
        reviewedByName: input.actor.userName,
        reviewedAt: new Date(),
        reviewNote: input.note.trim(),
      },
    });
  }

  /** Approve a request and carry out what it asked for, atomically. */
  async approve(input: ReviewInput) {
    const req = await prisma.transactionChangeRequest.findUnique({
      where: { id: input.requestId },
      include: { transaction: true },
    });
    if (!req) throw new Error('Request not found.');
    if (req.status !== 'PENDING') throw new Error(`This request is already ${req.status.toLowerCase()}.`);

    // An approver must be someone other than the person who raised it.
    if (req.requestedById === input.actor.userId) {
      throw new Error('A change request must be approved by someone other than the person who raised it.');
    }

    return prisma.$transaction(
      async (t) => {
        const db = t as TxClient;

        let outcome: string;
        switch (req.type) {
          case 'DISBURSEMENT_REVERSAL':
            outcome = await this.applyDisbursementReversal(db, req.transactionId, req.reason, input.actor.userId);
            break;
          case 'TRANSACTION_CANCEL':
            outcome = await this.applyCancellation(db, req.transactionId, req.reason, input.actor.userId);
            break;
          case 'TRANSACTION_EDIT':
            outcome = await this.applyEdit(db, req.transactionId, (req.proposedChanges ?? {}) as Record<string, unknown>);
            break;
          default:
            throw new Error(`Unsupported request type: ${req.type}`);
        }

        const updated = await db.transactionChangeRequest.update({
          where: { id: req.id },
          data: {
            status: ChangeRequestStatus.APPROVED,
            reviewedById: input.actor.userId,
            reviewedByName: input.actor.userName,
            reviewedAt: new Date(),
            reviewNote: input.note?.trim() || null,
          },
        });

        await db.auditLog.create({
          data: {
            userId: input.actor.userId,
            userName: input.actor.userName,
            userRole: input.actor.userRole as never,
            action: `APPROVE_${req.type}`,
            entity: 'Transaction',
            entityId: req.transactionId,
            changes: {
              requestId: req.id,
              reason: req.reason,
              requestedBy: req.requestedByName,
              outcome,
              snapshot: req.snapshot ?? undefined,
              proposedChanges: req.proposedChanges ?? undefined,
            } as Prisma.InputJsonValue,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
          },
        });

        return { request: updated, outcome };
      },
      { timeout: 60_000 }
    );
  }

  // ─── Effects ───────────────────────────────────────────────────────────────

  /**
   * Put a disbursement back: cash to the till, obligation back on the branch,
   * transaction payable again.  Mirrors LedgerService.recordDisbursement.
   */
  private async applyDisbursementReversal(
    db: TxClient,
    transactionId: string,
    reason: string,
    actorId: string
  ): Promise<string> {
    const tx = await db.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new Error('Transaction not found.');
    if (!['PAID', 'PARTIAL_PAYMENT'].includes(tx.status)) {
      throw new Error(`${tx.transactionCode} is ${tx.status} — there is nothing to reverse.`);
    }

    // Every disbursement leg recorded against this transaction, so a transaction
    // paid out in instalments is unwound in full rather than partially.
    const legs = await db.ledgerEntry.findMany({
      where: { transactionId, entryType: 'DISBURSEMENT' },
      select: { id: true, amount: true, debitAccountId: true, creditAccountId: true, currency: true },
    });
    if (legs.length === 0) {
      throw new Error(
        `No disbursement entries found for ${tx.transactionCode}. It may predate ledger tracking — cancel it instead.`
      );
    }

    let returned = 0;
    for (const leg of legs) {
      const amount = Number(leg.amount);
      returned += amount;

      // Mirror of the original: the till is credited back, the expense undone.
      await db.ledgerEntry.create({
        data: {
          debitAccountId: leg.creditAccountId,   // the till the cash came out of
          creditAccountId: leg.debitAccountId,   // the disbursement expense
          amount,
          currency: leg.currency,
          transactionId,
          description: `Reversal of disbursement — ${reason}`,
          entryType: 'DISBURSEMENT',
          enteredById: actorId,
          entryDate: new Date(),
        },
      });

      // The cash goes back into the drawer it left.
      await db.ledgerAccount.update({
        where: { id: leg.creditAccountId },
        data: { balance: { increment: amount } },
      });
    }

    // A standard payout settled the branch payable; reversing re-opens it.
    // ADDITIONAL transactions draw on their own till and never touched it.
    if (tx.codeType !== 'ADDITIONAL') {
      const payableCode = `PAYABLE-GHS-${tx.receivingPointId.substring(0, 8)}`;
      const payable = await db.ledgerAccount.findUnique({ where: { accountCode: payableCode }, select: { id: true } });
      if (payable) {
        await db.ledgerAccount.update({
          where: { id: payable.id },
          data: { balance: { increment: returned } },
        });
      }
    }

    // Counter-entries for the journals, leaving both sides on the record.
    const journals = await db.journalEntry.findMany({
      where: { transactionId, entryType: 'DISBURSEMENT', status: 'POSTED' },
      select: { id: true },
    });
    for (const j of journals) {
      await journalService.reverseJournalEntry(j.id, actorId, reason, db);
    }

    // Sub-payments are voided along with the disbursement they belong to.
    await db.subPayment.deleteMany({ where: { transactionId } });

    await db.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'SYNCED',
        paidAt: null,
        paidBy: null,
        paidByName: null,
        notes: [tx.notes, `Disbursement reversed: ${reason}`].filter(Boolean).join(' · '),
      },
    });

    return `Reversed GHS ${returned.toFixed(2)} across ${legs.length} disbursement leg(s); ${tx.transactionCode} is payable again.`;
  }

  /** Void a transaction outright, reversing any disbursement first. */
  private async applyCancellation(
    db: TxClient,
    transactionId: string,
    reason: string,
    actorId: string
  ): Promise<string> {
    const tx = await db.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new Error('Transaction not found.');

    let note = '';
    if (['PAID', 'PARTIAL_PAYMENT'].includes(tx.status)) {
      note = await this.applyDisbursementReversal(db, transactionId, reason, actorId);
    }

    await db.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'CANCELLED',
        notes: [tx.notes, `Cancelled: ${reason}`].filter(Boolean).join(' · '),
      },
    });

    return `${note} ${tx.transactionCode} cancelled.`.trim();
  }

  /** Apply the approved field changes. Amounts are deliberately not editable. */
  private async applyEdit(
    db: TxClient,
    transactionId: string,
    proposed: Record<string, unknown>
  ): Promise<string> {
    const data: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in proposed) data[field] = proposed[field as EditableField];
    }
    if (Object.keys(data).length === 0) throw new Error('Nothing to apply.');

    await db.transaction.update({ where: { id: transactionId }, data: data as Prisma.TransactionUpdateInput });
    return `Updated ${Object.keys(data).join(', ')}.`;
  }
}
