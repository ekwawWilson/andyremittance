import prisma from '@/lib/db/prisma';
import { TransactionCodeType, TransactionStatus, Prisma } from '@prisma/client';
import { JournalService } from '@/lib/services/journal.service';
import { LedgerService } from '@/lib/services/ledger.service';

const journalService = new JournalService();
const ledgerService = new LedgerService();

export class SyncService {
  // ─── syncTransactionsToReceiving ────────────────────────────────────────────
  // Marks matching PENDING/PARTIAL transactions as SYNCED and funds the vaults.
  //
  // Atomicity guarantee:
  //   The status update (updateMany → SYNCED) and the vault balance increment
  //   happen inside a single prisma.$transaction, so a server crash between them
  //   can never leave transactions SYNCED without the vault being funded.
  async syncTransactionsToReceiving(
    codeType: TransactionCodeType,
    transactionDate?: Date,
    endOfDayRecordId?: string   // if provided, stamps the EOD record ID in the same update
  ) {
    const where: Prisma.TransactionWhereInput = {
      codeType,
      syncedToReceiving: false,
      status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIAL] },
    };

    if (transactionDate) {
      where.transactionDate = transactionDate;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        sender:         true,
        receiver:       true,
        receivingPoint: true,
      },
    });

    if (transactions.length === 0) {
      return { synced: 0, transactions: [] };
    }

    const transactionIds = transactions.map((t) => t.id);

    // Fetch system user once (used for journal author on vault allocations)
    const systemUser = await prisma.user.findFirst({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!systemUser) {
      throw new Error('No admin user found to author sync journal entries');
    }

    // ── Atomic block ────────────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      // 1. Mark all transactions SYNCED (+ stamp EOD record ID if given)
      await tx.transaction.updateMany({
        where: { id: { in: transactionIds } },
        data: {
          syncedToReceiving: true,
          syncedAt: new Date(),
          status: 'SYNCED',
          ...(endOfDayRecordId ? { endOfDayRecordId } : {}),
        },
      });

      // 2. Fund the appropriate accounts
      if (codeType === 'ADDITIONAL') {
        await this.allocateFundsToAdditionalTillTx(transactions, journalDate(transactionDate), systemUser.id, tx);
      } else {
        await this.allocateFundsToVaultsTx(transactions, journalDate(transactionDate), systemUser.id, tx);
      }
    }, { timeout: 30_000 });   // EOD can have many rows — give it 30 s

    return { synced: transactions.length, transactions };
  }

  // ── Payable allocation (inside a transaction) ─────────────────────────────
  // Aggregates GHS totals per receiving point and credits a per-branch
  // REMITTANCE-PAYABLE-GHS account.  The vault is NOT touched here — the
  // receiving branch settles the payable into their vault when they close
  // their own EOD (ReceivingEodRecord).
  private async allocateFundsToVaultsTx(
    transactions: Array<{ receivingPointId: string; ghsAmount: unknown; id: string }>,
    jDate: Date,
    systemUserId: string,
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
  ) {
    // Aggregate per receiving point
    const totals = transactions.reduce((acc, t) => {
      acc[t.receivingPointId] = (acc[t.receivingPointId] ?? 0) + Number(t.ghsAmount);
      return acc;
    }, {} as Record<string, number>);

    const pointIds = Object.keys(totals);
    if (pointIds.length === 0) return;

    for (const receivingPointId of pointIds) {
      const increment = totals[receivingPointId];
      if (!increment) continue;

      // Get or create the per-branch REMITTANCE-PAYABLE-GHS account
      const payableCode = `PAYABLE-GHS-${receivingPointId.substring(0, 8)}`;
      let payable = await tx.ledgerAccount.findUnique({ where: { accountCode: payableCode } });
      if (!payable) {
        payable = await tx.ledgerAccount.create({
          data: {
            accountCode: payableCode,
            accountName: 'Remittance Payable — GHS',
            accountType: 'LIABILITY',
            accountGroup: '4000',
            accountNumber: '4100',
            currency: 'GHS',
            receivingPointId,
            balance: 0,
            isActive: true,
          },
        });
      }

      await tx.ledgerAccount.update({
        where: { id: payable.id },
        data: { balance: { increment } },
      });

      const ref = `SYNC-${receivingPointId.substring(0, 6)}-${jDate.toISOString().split('T')[0]}`;

      // Journal inside the same tx — awaited so failure rolls everything back
      await journalService.recordSyncAllocation(
        payableCode,
        increment,
        receivingPointId,
        ref,
        systemUserId,
        jDate,
        tx as Parameters<typeof journalService.recordSyncAllocation>[6]
      );
    }
  }

  // ── Additional-till allocation (inside a transaction) ─────────────────────
  private async allocateFundsToAdditionalTillTx(
    transactions: Array<{ receivingPointId: string; ghsAmount: unknown; id: string; transactionCode?: string }>,
    jDate: Date,
    systemUserId: string,
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
  ) {
    for (const transaction of transactions) {
      await ledgerService.fundAdditionalTillForImmediateTransaction(
        transaction.id,
        Number(transaction.ghsAmount),
        transaction.receivingPointId,
        transaction.transactionCode ?? transaction.id.substring(0, 8),
        systemUserId,
        jDate,
        tx as Parameters<typeof ledgerService.fundAdditionalTillForImmediateTransaction>[6]
      );
    }
  }

  // ─── endOfDaySync ────────────────────────────────────────────────────────────
  // Runs the EOD sync and stamps the EOD record ID in the same atomic updateMany.
  async endOfDaySync(date: Date, endOfDayRecordId?: string) {
    return this.syncTransactionsToReceiving('STANDARD', date, endOfDayRecordId);
  }

  // ─── additionalSync ──────────────────────────────────────────────────────────
  async additionalSync() {
    return this.syncTransactionsToReceiving('ADDITIONAL');
  }

  // ─── getPendingForSync ───────────────────────────────────────────────────────
  async getPendingForSync(codeType?: TransactionCodeType) {
    const where: Prisma.TransactionWhereInput = {
      syncedToReceiving: false,
      status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIAL] },
    };

    if (codeType) {
      where.codeType = codeType;
    }

    return prisma.transaction.findMany({
      where,
      include: {
        sender:         true,
        receiver:       true,
        receivingPoint: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns UTC midnight for the given date (or today if undefined). */
function journalDate(d?: Date): Date {
  const base = d ? new Date(d) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}
