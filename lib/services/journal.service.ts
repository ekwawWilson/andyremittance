/**
 * JournalService — double-entry accounting journal layer.
 *
 * Every financial movement in the system generates a JournalEntry + JournalLines
 * that record the accounting treatment alongside the operational LedgerEntry.
 *
 * All public methods accept an optional `tx` (Prisma transaction client) so callers
 * can include journal creation in the same atomic transaction as the operational writes.
 */

import { JournalEntryType, PrismaClient } from '@prisma/client';
import prisma from '@/lib/db/prisma';

export type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface JournalLineInput {
  accountCode: string; // looked up by code so callers don't need IDs
  debit?: number;
  credit?: number;
  currency: 'CAD' | 'GHS';
  description?: string;
}

export interface CreateJournalInput {
  journalDate: Date;
  reference: string;
  description: string;
  entryType: JournalEntryType;
  createdById: string;
  receivingPointId?: string | null;
  transactionId?: string | null;
  reconciliationId?: string | null;
  transferRequestId?: string | null;
  lines: JournalLineInput[];
}

export class JournalService {
  /**
   * Create a balanced journal entry (sum of debits === sum of credits per currency).
   * Throws if the entry is unbalanced or if any account code is not found.
   */
  async createJournalEntry(input: CreateJournalInput, tx?: TxClient) {
    const db = tx ?? prisma;

    // Validate period is open (skip for SUPER_ADMIN manual entries if caller passes force=true elsewhere)
    await this.assertPeriodOpen(input.journalDate, input.receivingPointId ?? null, db);

    // Resolve all account codes → IDs
    const codes = [...new Set(input.lines.map((l) => l.accountCode))];
    const accounts = await db.ledgerAccount.findMany({
      where: { accountCode: { in: codes } },
      select: { id: true, accountCode: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.accountCode, a.id]));

    for (const code of codes) {
      if (!accountMap.has(code)) {
        throw new Error(`Account not found: ${code}`);
      }
    }

    // Validate balance: per currency, total debits must equal total credits
    const totals: Record<string, { debit: number; credit: number }> = {};
    for (const line of input.lines) {
      if (!totals[line.currency]) totals[line.currency] = { debit: 0, credit: 0 };
      totals[line.currency].debit  += line.debit  ?? 0;
      totals[line.currency].credit += line.credit ?? 0;
    }
    for (const [ccy, { debit, credit }] of Object.entries(totals)) {
      if (Math.abs(debit - credit) > 0.005) {
        throw new Error(`Journal entry is unbalanced for ${ccy}: debits=${debit.toFixed(2)}, credits=${credit.toFixed(2)}`);
      }
    }

    // Create entry + lines
    const entry = await db.journalEntry.create({
      data: {
        journalDate: input.journalDate,
        reference: input.reference,
        description: input.description,
        entryType: input.entryType,
        status: 'POSTED',
        receivingPointId: input.receivingPointId ?? null,
        transactionId: input.transactionId ?? null,
        reconciliationId: input.reconciliationId ?? null,
        transferRequestId: input.transferRequestId ?? null,
        createdById: input.createdById,
        lines: {
          create: input.lines.map((l) => ({
            accountId: accountMap.get(l.accountCode)!,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            currency: l.currency,
            description: l.description ?? null,
          })),
        },
      },
      include: { lines: true },
    });

    return entry;
  }

  /**
   * Reverse an existing POSTED journal entry.
   * Creates a counter-entry with swapped debit/credit lines and marks the original REVERSED.
   */
  async reverseJournalEntry(
    journalEntryId: string,
    reversedById: string,
    reason?: string,
    tx?: TxClient
  ): Promise<Awaited<ReturnType<typeof prisma.journalEntry.create>>> {
    const db = tx ?? prisma;

    const original = await db.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: { lines: true },
    });
    if (!original) throw new Error('Journal entry not found');
    if (original.status !== 'POSTED') throw new Error(`Cannot reverse a ${original.status} journal entry`);

    if (tx) {
      const rev = await db.journalEntry.create({
        data: {
          journalDate: new Date(),
          reference: `REV-${original.reference}`,
          description: `Reversal of: ${original.description}${reason ? ` — ${reason}` : ''}`,
          entryType: original.entryType,
          status: 'POSTED',
          receivingPointId: original.receivingPointId,
          transactionId: original.transactionId,
          reconciliationId: original.reconciliationId,
          transferRequestId: original.transferRequestId,
          createdById: reversedById,
          reversalOfId: original.id,
          lines: {
            create: original.lines.map((l) => ({
              accountId: l.accountId,
              debit: Number(l.credit),
              credit: Number(l.debit),
              currency: l.currency,
              description: `Reversal: ${l.description ?? ''}`,
            })),
          },
        },
        include: { lines: true },
      });

      await db.journalEntry.update({
        where: { id: original.id },
        data: { status: 'REVERSED', reversedById, reversedAt: new Date() },
      });

      return rev;
    }

    return prisma.$transaction((innerTx) =>
      this.reverseJournalEntry(journalEntryId, reversedById, reason, innerTx as TxClient)
    );
  }

  // ─── Journal templates ────────────────────────────────────────────────────

  /**
   * REMITTANCE_RECEIPT — sender pays CAD to agent.
   * Dr COMPANY_CASH (1100)   CAD amount
   *   Cr INCOME-STANDARD/ADDITIONAL (6100/6200)  CAD amount
   */
  async recordRemittanceReceipt(
    transactionId: string,
    cadAmount: number,
    codeType: 'STANDARD' | 'ADDITIONAL',
    reference: string,
    createdById: string,
    journalDate: Date,
    tx?: TxClient
  ) {
    const incomeCode = codeType === 'ADDITIONAL' ? 'INCOME-ADDITIONAL' : 'INCOME-STANDARD';
    return this.createJournalEntry({
      journalDate,
      reference,
      description: `Remittance receipt — ${reference}`,
      entryType: 'REMITTANCE_RECEIPT',
      createdById,
      transactionId,
      lines: [
        { accountCode: 'CASH-CAD',   debit: cadAmount,  currency: 'CAD', description: 'Cash received from sender' },
        { accountCode: incomeCode,   credit: cadAmount, currency: 'CAD', description: 'Remittance income' },
      ],
    }, tx);
  }

  /**
   * SYNC_ALLOCATION — EOD: sending side records the GHS obligation to a branch.
   * Dr EQUITY-RETAINED-GHS   GHS  (head-office funds consumed)
   *   Cr REMITTANCE-PAYABLE-GHS   GHS  (sending side owes this branch)
   *
   * The vault is NOT touched here. The receiving branch settles the payable
   * into their vault when they close their own EOD (recordPayableToVaultSettlement).
   */
  async recordSyncAllocation(
    payableAccountCode: string,
    ghsAmount: number,
    receivingPointId: string,
    reference: string,
    createdById: string,
    journalDate: Date,
    tx?: TxClient
  ) {
    return this.createJournalEntry({
      journalDate,
      reference,
      description: `EOD sync — GHS payable to branch — ${reference}`,
      entryType: 'SYNC_ALLOCATION',
      createdById,
      receivingPointId,
      lines: [
        { accountCode: 'EQUITY-RETAINED-GHS', debit:  ghsAmount, currency: 'GHS', description: 'Head-office funds allocated' },
        { accountCode: payableAccountCode,     credit: ghsAmount, currency: 'GHS', description: 'GHS payable to receiving branch' },
      ],
    }, tx);
  }

  /**
   * SYNC_ALLOCATION — immediate transaction funds made available on ADDITIONAL_TILL.
   * Dr ADDITIONAL_TILL  GHS
   *   Cr EQUITY-RETAINED-GHS  GHS
   */
  async recordImmediateAllocation(
    additionalTillAccountCode: string,
    ghsAmount: number,
    receivingPointId: string,
    reference: string,
    createdById: string,
    journalDate: Date,
    transactionId?: string | null,
    tx?: TxClient
  ) {
    return this.createJournalEntry({
      journalDate,
      reference,
      description: `Immediate allocation to additional till — ${reference}`,
      entryType: 'SYNC_ALLOCATION',
      createdById,
      receivingPointId,
      transactionId: transactionId ?? null,
      lines: [
        { accountCode: additionalTillAccountCode, debit: ghsAmount, currency: 'GHS', description: 'Immediate payout funds made available' },
        { accountCode: 'EQUITY-RETAINED-GHS',     credit: ghsAmount, currency: 'GHS', description: 'Head-office fund injection' },
      ],
    }, tx);
  }

  /**
   * DISBURSEMENT — teller pays GHS to receiver.
   * Dr DISBURSE-EXPENSE (7100)  GHS amount
   *   Cr TELLER_TILL (2110)       GHS amount
   */
  async recordDisbursementJournal(
    tillAccountCode: string,
    ghsAmount: number,
    receivingMode: 'CASH' | 'BANK' | 'MOMO',
    transactionId: string,
    receivingPointId: string,
    reference: string,
    createdById: string,
    journalDate: Date,
    tx?: TxClient
  ) {
    const expenseCode =
      receivingMode === 'BANK' ? 'BANK-DISBURSE-EXPENSE' :
      receivingMode === 'MOMO' ? 'MOMO-DISBURSE-EXPENSE' :
      'DISBURSE-EXPENSE';

    return this.createJournalEntry({
      journalDate,
      reference,
      description: `Disbursement to receiver — ${reference}`,
      entryType: 'DISBURSEMENT',
      createdById,
      transactionId,
      receivingPointId,
      lines: [
        { accountCode: expenseCode,     debit: ghsAmount,  currency: 'GHS', description: 'Disbursement expense' },
        {
          accountCode: tillAccountCode,
          credit: ghsAmount,
          currency: 'GHS',
          description: tillAccountCode === 'ADDITIONAL_TILL' ? 'Funds released from additional till' : 'Cash paid from teller till',
        },
      ],
    }, tx);
  }

  /**
   * VAULT_TRANSFER (vault → teller).
   * Dr TELLER_TILL  GHS amount
   *   Cr COMPANY_VAULT  GHS amount
   */
  async recordVaultToTellerJournal(
    vaultAccountCode: string,
    tillAccountCode: string,
    ghsAmount: number,
    receivingPointId: string,
    reference: string,
    createdById: string,
    transferRequestId: string | null,
    tx?: TxClient
  ) {
    return this.createJournalEntry({
      journalDate: new Date(),
      reference,
      description: `Vault to teller float transfer — ${reference}`,
      entryType: 'VAULT_TRANSFER',
      createdById,
      receivingPointId,
      transferRequestId,
      lines: [
        { accountCode: tillAccountCode,  debit: ghsAmount,  currency: 'GHS', description: 'Float received into till' },
        { accountCode: vaultAccountCode, credit: ghsAmount, currency: 'GHS', description: 'Cash disbursed from vault' },
      ],
    }, tx);
  }

  /**
   * VAULT_TRANSFER (teller → vault).
   * Dr COMPANY_VAULT  GHS amount
   *   Cr TELLER_TILL  GHS amount
   */
  async recordTellerToVaultJournal(
    tillAccountCode: string,
    vaultAccountCode: string,
    ghsAmount: number,
    receivingPointId: string,
    reference: string,
    createdById: string,
    transferRequestId: string | null,
    tx?: TxClient
  ) {
    return this.createJournalEntry({
      journalDate: new Date(),
      reference,
      description: `Teller cash return to vault — ${reference}`,
      entryType: 'VAULT_TRANSFER',
      createdById,
      receivingPointId,
      transferRequestId,
      lines: [
        { accountCode: vaultAccountCode, debit: ghsAmount,  currency: 'GHS', description: 'Cash returned to vault' },
        { accountCode: tillAccountCode,  credit: ghsAmount, currency: 'GHS', description: 'Cash removed from teller till' },
      ],
    }, tx);
  }

  /**
   * TELLER_RECONCILIATION — variance write-off.
   * Shortage (variance < 0): Dr VARIANCE-EXPENSE  |  Cr TELLER_TILL
   * Excess   (variance > 0): Dr TELLER_TILL        |  Cr EQUITY-RETAINED-GHS
   */
  async recordReconciliationVariance(
    tillAccountCode: string,
    variance: number, // signed: negative = shortage, positive = excess
    reconciliationId: string,
    receivingPointId: string,
    reference: string,
    createdById: string,
    tx?: TxClient
  ) {
    if (Math.abs(variance) < 0.005) return null; // no journal needed for zero variance

    const absVariance = Math.abs(variance);
    const lines: JournalLineInput[] =
      variance < 0
        ? [
            { accountCode: 'VARIANCE-EXPENSE', debit: absVariance,  currency: 'GHS', description: 'Cash shortage write-off' },
            { accountCode: tillAccountCode,     credit: absVariance, currency: 'GHS', description: 'Till shortage adjustment' },
          ]
        : [
            { accountCode: tillAccountCode,           debit: absVariance,  currency: 'GHS', description: 'Till excess adjustment' },
            { accountCode: 'EQUITY-RETAINED-GHS',     credit: absVariance, currency: 'GHS', description: 'Excess cash credited to equity' },
          ];

    return this.createJournalEntry({
      journalDate: new Date(),
      reference,
      description: `Reconciliation variance ${variance < 0 ? 'shortage' : 'excess'} — ${reference}`,
      entryType: 'TELLER_RECONCILIATION',
      createdById,
      receivingPointId,
      reconciliationId,
      lines,
    }, tx);
  }

  // ─── Sending-side cash management ────────────────────────────────────────

  /**
   * CASH_DEPOSIT — physical cash deposited into the sending-side vault.
   * Dr CASH-CAD   CAD amount
   *   Cr EQUITY-RETAINED-CAD  CAD amount
   *
   * Used when the agent/admin counts physical cash received outside of
   * normal transaction flow (e.g. opening float, external cash injection).
   */
  async recordCashDeposit(
    cadAmount: number,
    reference: string,
    createdById: string,
    journalDate: Date,
    description?: string,
    tx?: TxClient
  ) {
    return this.createJournalEntry({
      journalDate,
      reference,
      description: description ?? `Cash deposit into sending vault — ${reference}`,
      entryType: 'CASH_DEPOSIT',
      createdById,
      lines: [
        { accountCode: 'CASH-CAD',            debit: cadAmount,  currency: 'CAD', description: 'Cash deposited into vault' },
        { accountCode: 'EQUITY-RETAINED-CAD', credit: cadAmount, currency: 'CAD', description: 'Equity — cash injection' },
      ],
    }, tx);
  }

  /**
   * BANK_TRANSFER — funds moved from CASH-CAD to the bank clearing account.
   * Dr BANK-CLEARING   CAD amount
   *   Cr CASH-CAD        CAD amount
   *
   * Records the physical movement of cash to a bank. The BANK-CLEARING balance
   * reflects funds in transit / held at bank on the sending side.
   */
  async recordBankTransfer(
    cadAmount: number,
    reference: string,
    createdById: string,
    journalDate: Date,
    description?: string,
    tx?: TxClient
  ) {
    return this.createJournalEntry({
      journalDate,
      reference,
      description: description ?? `Bank transfer from cash vault — ${reference}`,
      entryType: 'BANK_TRANSFER',
      createdById,
      lines: [
        { accountCode: 'BANK-CLEARING', debit: cadAmount,  currency: 'CAD', description: 'Funds deposited to bank' },
        { accountCode: 'CASH-CAD',      credit: cadAmount, currency: 'CAD', description: 'Cash removed from vault' },
      ],
    }, tx);
  }

  /**
   * OPERATING_EXPENSE — operating cost paid out of the sending-side vault.
   * Dr <expenseCode>  CAD amount
   *   Cr CASH-CAD       CAD amount
   *
   * expenseCode should be one of: OPEX-GENERAL-CAD, OPEX-SALARY-CAD,
   * OPEX-BANK-FEE-CAD, OPEX-OTHER-CAD
   */
  async recordOperatingExpense(
    expenseAccountCode: string,
    cadAmount: number,
    reference: string,
    createdById: string,
    journalDate: Date,
    description?: string,
    tx?: TxClient
  ) {
    return this.createJournalEntry({
      journalDate,
      reference,
      description: description ?? `Operating expense — ${reference}`,
      entryType: 'OPERATING_EXPENSE',
      createdById,
      lines: [
        { accountCode: expenseAccountCode, debit: cadAmount,  currency: 'CAD', description: description ?? 'Operating expense' },
        { accountCode: 'CASH-CAD',         credit: cadAmount, currency: 'CAD', description: 'Cash paid from vault' },
      ],
    }, tx);
  }

  // ─── Period guard ─────────────────────────────────────────────────────────

  private async assertPeriodOpen(
    date: Date,
    receivingPointId: string | null,
    db: TxClient
  ) {
    const year  = date.getFullYear();
    const month = date.getMonth() + 1;

    const closedPeriod = await db.accountingPeriod.findFirst({
      where: {
        periodYear: year,
        periodMonth: month,
        OR: [
          { receivingPointId },
          { receivingPointId: null },
        ],
        status: { not: 'OPEN' },
      },
    });

    if (closedPeriod) {
      throw new Error(
        `Accounting period ${year}-${String(month).padStart(2, '0')} is ${closedPeriod.status.toLowerCase()} — cannot post journal entries`
      );
    }
  }
}
