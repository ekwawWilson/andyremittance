import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { ensureReceivingPointAccess, requirePermission } from '@/lib/auth/permissions';
import { JournalService, TxClient } from '@/lib/services/journal.service';
import { LedgerAccountType } from '@prisma/client';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const journalService = new JournalService();

function getBusinessDayWindow(date: Date) {
  const businessDate = new Date(date);
  businessDate.setUTCHours(0, 0, 0, 0);
  const nextDay = new Date(businessDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return { businessDate, nextDay };
}

/**
 * Finds or creates a system ledger account by its accountCode.
 * Used to resolve the counterpart account for reconciliation variance entries.
 */
async function getOrCreateSystemAccount(
  db: TxClient,
  accountCode: string,
  accountName: string,
  accountType: LedgerAccountType,
  accountGroup: string,
  accountNumber: string
) {
  const existing = await db.ledgerAccount.findUnique({ where: { accountCode } });
  if (existing) return existing;
  return db.ledgerAccount.create({
    data: { accountCode, accountName, accountType, accountGroup, accountNumber, currency: 'GHS' },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'APPROVE_RECONCILIATION');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const { id } = await params;

    const recon = await prisma.tellerReconciliation.findUnique({
      where: { id },
      include: {
        teller: { select: { firstName: true, lastName: true } },
        receivingPoint: { select: { name: true, code: true } },
      },
    });
    if (!recon) return errorResponse('Reconciliation not found', 404);
    const accessError = ensureReceivingPointAccess(
      request,
      recon.receivingPointId,
      'Cannot approve reconciliation for another receiving point'
    );
    if (accessError) return accessError;
    const approver = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const approverName = approver ? `${approver.firstName} ${approver.lastName}` : 'Admin';

    const variance = Number(recon.variance);
    const absVariance = Math.abs(variance);
    // Match the submission threshold — PENDING is only created when |variance| >= 0.001
    const hasVariance = absVariance >= 0.001;
    const { businessDate, nextDay } = getBusinessDayWindow(recon.reconciliationDate);

    // Find the teller's till ledger account
    const tellerTill = await prisma.ledgerAccount.findFirst({
      where: { accountType: 'TELLER_TILL', userId: recon.tellerId },
      select: { id: true, accountCode: true },
    });

    const reconDate = new Date(recon.reconciliationDate);
    const ref = `RECON-${recon.receivingPoint?.code ?? recon.receivingPointId.substring(0, 6)}-${reconDate.toISOString().split('T')[0]}`;

    // Run approval + variance adjustment atomically
    const updated = await prisma.$transaction(async (tx: TxClient) => {
      const current = await tx.tellerReconciliation.findUnique({
        where: { id },
        select: {
          id: true,
          tellerId: true,
          status: true,
          reconciliationDate: true,
        },
      });
      if (!current) {
        throw new Error('Reconciliation not found');
      }
      if (current.status !== 'PENDING') {
        throw new Error(`Reconciliation is already ${current.status.toLowerCase()}`);
      }

      const latestForDay = await tx.tellerReconciliation.findFirst({
        where: {
          tellerId: current.tellerId,
          reconciliationDate: { gte: businessDate, lt: nextDay },
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        select: { id: true },
      });

      if (!latestForDay || latestForDay.id !== id) {
        const staleError = new Error(
          'A newer reconciliation submission exists for this teller and day. Approve the latest submission instead.'
        ) as Error & { status?: number };
        staleError.status = 409;
        throw staleError;
      }

      // 1. Approve the reconciliation
      const approved = await tx.tellerReconciliation.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedByName: approverName,
          approvedAt: new Date(),
        },
        include: {
          teller: { select: { firstName: true, lastName: true } },
          receivingPoint: { select: { name: true, code: true } },
        },
      });

      // 2. If variance is non-zero and till account exists, adjust till balance + record entries
      if (hasVariance && tellerTill) {
        if (variance < 0) {
          // Shortage: teller had less cash than expected.
          // Dr VARIANCE-EXPENSE | Cr TELLER_TILL
          // Till balance decrements — the missing cash is written off.
          const varianceExpenseAccount = await getOrCreateSystemAccount(
            tx,
            'VARIANCE-EXPENSE',
            'Teller Variance Expense',
            LedgerAccountType.EXPENSE,
            '8000',
            '8100'
          );

          await Promise.all([
            tx.ledgerEntry.create({
              data: {
                debitAccountId: varianceExpenseAccount.id,
                creditAccountId: tellerTill.id,
                amount: absVariance,
                currency: 'GHS',
                description: `Reconciliation shortage write-off — ${ref}`,
                entryType: 'RECONCILIATION',
                enteredById: userId,
                entryDate: reconDate,
              },
            }),
            tx.ledgerAccount.update({
              where: { id: tellerTill.id },
              data: { balance: { decrement: absVariance } },
            }),
          ]);
        } else {
          // Excess: teller had more cash than expected.
          // Dr TELLER_TILL | Cr EQUITY-RETAINED-GHS
          // Till balance increments — the extra cash is credited to equity.
          const equityAccount = await getOrCreateSystemAccount(
            tx,
            'EQUITY-RETAINED-GHS',
            'Retained Earnings (GHS)',
            LedgerAccountType.EQUITY,
            '3000',
            '3100'
          );

          await Promise.all([
            tx.ledgerEntry.create({
              data: {
                debitAccountId: tellerTill.id,
                creditAccountId: equityAccount.id,
                amount: absVariance,
                currency: 'GHS',
                description: `Reconciliation excess credit — ${ref}`,
                entryType: 'RECONCILIATION',
                enteredById: userId,
                entryDate: reconDate,
              },
            }),
            tx.ledgerAccount.update({
              where: { id: tellerTill.id },
              data: { balance: { increment: absVariance } },
            }),
          ]);
        }

        // Post the double-entry journal entry (accounting layer on top of ledger)
        await journalService.recordReconciliationVariance(
          tellerTill.accountCode,
          variance,
          id,
          recon.receivingPointId,
          ref,
          userId,
          tx
        );
      }

      return approved;
    });

    void prisma.auditLog.create({
      data: {
        userId,
        action: 'APPROVE_RECONCILIATION',
        entity: 'TellerReconciliation',
        entityId: id,
        changes: JSON.parse(JSON.stringify({
          approvedBy: approverName,
          variance,
          tillAdjusted: hasVariance && !!tellerTill,
        })),
      },
    }).catch((e) => console.error('Audit log error:', e));

    return successResponse(updated, 'Reconciliation approved');
  } catch (error) {
    console.error('Approve reconciliation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to approve reconciliation';
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 400;
    return errorResponse(message, status || 400);
  }
}
