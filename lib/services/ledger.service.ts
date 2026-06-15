import { Prisma, LedgerAccountType, PaymentMethod, PrismaClient, LedgerEntry } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { JournalService } from '@/lib/services/journal.service';

// Type alias for a Prisma transaction client (same API surface as PrismaClient)
export type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const journalService = new JournalService();

export class LedgerService {
  private async calculateAccountBalanceFromEntries(
    accountId: string,
    entryDate?: Prisma.DateTimeFilter
  ) {
    const dateFilter = entryDate ? { entryDate } : {};
    const [debits, credits] = await Promise.all([
      prisma.ledgerEntry.aggregate({
        where: { debitAccountId: accountId, ...dateFilter },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { creditAccountId: accountId, ...dateFilter },
        _sum: { amount: true },
      }),
    ]);

    return Number(debits._sum.amount ?? 0) - Number(credits._sum.amount ?? 0);
  }

  private async getOrCreateAdditionalTillAccount(db: TxClient) {
    const existing = await db.ledgerAccount.findUnique({
      where: { accountCode: 'ADDITIONAL_TILL' },
    });

    if (existing) {
      return existing;
    }

    return db.ledgerAccount.create({
      data: {
        accountType: LedgerAccountType.ADDITIONAL_TILL,
        accountName: 'Additional Till - Immediate Payments',
        accountCode: 'ADDITIONAL_TILL',
        currency: 'GHS',
        accountGroup: '2000',
        accountNumber: '2120',
      },
    });
  }

  private async getOrCreateDisbursementExpenseAccount(
    db: TxClient,
    receivingMode: 'CASH' | 'BANK' | 'MOMO'
  ) {
    const config = {
      CASH: {
        code: 'DISBURSE-EXPENSE',
        name: 'Cash Disbursement Expense - GHS',
        number: '7100',
      },
      BANK: {
        code: 'BANK-DISBURSE-EXPENSE',
        name: 'Bank Transfer Disbursement - GHS',
        number: '7200',
      },
      MOMO: {
        code: 'MOMO-DISBURSE-EXPENSE',
        name: 'MoMo Disbursement Expense - GHS',
        number: '7300',
      },
    }[receivingMode];

    const existing = await db.ledgerAccount.findUnique({
      where: { accountCode: config.code },
    });

    if (existing) {
      return existing;
    }

    return db.ledgerAccount.create({
      data: {
        accountType: LedgerAccountType.EXPENSE,
        accountName: config.name,
        accountCode: config.code,
        currency: 'GHS',
        accountGroup: '7000',
        accountNumber: config.number,
      },
    });
  }

  // ─── recordTransactionPayment ──────────────────────────────────────────────
  // Records the CAD payment from a sender for a transaction.
  // Always runs inside a DB transaction so the ledger entry + two balance
  // updates + journal entry are all-or-nothing.
  async recordTransactionPayment(
    transactionId: string,
    senderId: string,
    amountPaid: number,
    paymentMethod: PaymentMethod,
    enteredById: string,
    codeType?: 'STANDARD' | 'ADDITIONAL',
    transactionCode?: string,
    transactionDate?: Date,
    tx?: TxClient,
    createDebt = true   // false for subsequent partial payments (debt already recorded at creation)
  ): Promise<void> {
    if (!tx) {
      return prisma.$transaction((innerTx) =>
        this.recordTransactionPayment(
          transactionId,
          senderId,
          amountPaid,
          paymentMethod,
          enteredById,
          codeType,
          transactionCode,
          transactionDate,
          innerTx as TxClient,
          createDebt
        )
      );
    }

    const db = tx;

    // Get or create sender ledger — use upsert to avoid race-condition duplicate
    // (schema has @unique on senderId so two concurrent creates would collide).
    let senderLedger = await db.ledgerAccount.findFirst({
      where: { accountType: LedgerAccountType.SENDER, senderId },
    });

    if (!senderLedger) {
      senderLedger = await db.ledgerAccount.create({
        data: {
          accountType: LedgerAccountType.SENDER,
          accountName: 'Sender Ledger',
          accountCode: `SENDER-${senderId}`,   // full UUID — no collision risk
          senderId,
          currency: 'CAD',
          accountGroup: '1000',
          accountNumber: '1110',
        },
      });
    }

    // Get company cash ledger
    const companyCashLedger = await db.ledgerAccount.findFirst({
      where: { accountType: LedgerAccountType.COMPANY_CASH },
    });

    if (!companyCashLedger) {
      throw new Error('Company cash ledger not found');
    }

    // The sender ledger tracks outstanding debt using the convention:
    //   negative balance = sender owes money
    //   positive balance = sender has credit (overpaid)
    //
    // Step 1 — always record the full transaction amount as a new debt
    //           (decrement = more negative = more debt owed).
    // Step 2 — record the upfront payment, which reduces that debt
    //           (increment = less negative = less debt owed).
    // Net when fully paid: -cadAmount + cadAmount = 0  ✓
    // Net when partially paid: -cadAmount + partial = -(cadAmount - partial) ✓

    const journalDate = transactionDate ?? new Date();
    const reference = transactionCode ?? transactionId.substring(0, 8);

    // Step 1: record the debt — only on first call (transaction creation).
    // Subsequent partial payments must NOT re-create the debt.
    if (createDebt) {
      // Fetch the full cadAmount from the transaction record so we record
      // the entire obligation, not just the upfront payment.
      const txRecord = await db.transaction.findUnique({
        where: { id: transactionId },
        select: { cadAmount: true },
      });
      const fullCadAmount = txRecord ? Number(txRecord.cadAmount) : amountPaid;
      await db.ledgerAccount.update({
        where: { id: senderLedger.id },
        data: { balance: { decrement: fullCadAmount } },
      });
    }

    if (amountPaid > 0) {
      // Step 2: record the payment (reduces debt)
      // All writes are already inside the caller's $transaction (tx),
      // so they commit atomically with the surrounding work.
      await Promise.all([
        db.ledgerEntry.create({
          data: {
            debitAccountId: companyCashLedger.id,
            creditAccountId: senderLedger.id,
            amount: amountPaid,
            currency: 'CAD',
            transactionId,
            description: `Payment received - ${paymentMethod}`,
            entryType: 'PAYMENT',
            enteredById,
            entryDate: journalDate,
          },
        }),
        db.ledgerAccount.update({
          where: { id: companyCashLedger.id },
          data: { balance: { increment: amountPaid } },
        }),
        db.ledgerAccount.update({
          where: { id: senderLedger.id },
          data: { balance: { increment: amountPaid } },
        }),
      ]);

      // Journal must also be inside the same tx — pass tx through
      await journalService.recordRemittanceReceipt(
        transactionId,
        amountPaid,
        codeType ?? 'STANDARD',
        reference,
        enteredById,
        journalDate,
        tx
      );
    }
  }

  // Reverse the sender-side financial effects of a transaction before it reaches
  // the receiving branch. This restores sender debt and collected cash to their
  // pre-transaction state so edits/cancellations can safely replay fresh values.
  async reverseTransactionPaymentAndDebt(
    transactionId: string,
    senderId: string,
    cadAmount: number,
    enteredById: string,
    reason: string,
    tx?: TxClient
  ): Promise<{ totalPaid: number }> {
    if (!tx) {
      return prisma.$transaction((innerTx) =>
        this.reverseTransactionPaymentAndDebt(
          transactionId,
          senderId,
          cadAmount,
          enteredById,
          reason,
          innerTx as TxClient
        )
      );
    }

    const db = tx;
    const senderLedger = await db.ledgerAccount.findFirst({
      where: { accountType: LedgerAccountType.SENDER, senderId },
    });

    if (!senderLedger) {
      throw new Error('Sender ledger not found');
    }

    const companyCashLedger = await db.ledgerAccount.findFirst({
      where: { accountType: LedgerAccountType.COMPANY_CASH },
    });

    if (!companyCashLedger) {
      throw new Error('Company cash ledger not found');
    }

    const [paymentEntries, remittanceJournals] = await Promise.all([
      db.ledgerEntry.findMany({
        where: {
          transactionId,
          entryType: { in: ['PAYMENT', 'PAYMENT_REVERSAL'] },
        },
        select: { amount: true, entryType: true },
      }),
      db.journalEntry.findMany({
        where: {
          transactionId,
          entryType: 'REMITTANCE_RECEIPT',
          status: 'POSTED',
        },
        select: { id: true },
      }),
    ]);

    const totalPaid = paymentEntries.reduce((sum, entry) => {
      const amount = Number(entry.amount);
      return entry.entryType === 'PAYMENT_REVERSAL' ? sum - amount : sum + amount;
    }, 0);

    await db.ledgerAccount.update({
      where: { id: senderLedger.id },
      data: { balance: { increment: cadAmount } },
    });

    if (totalPaid > 0) {
      await Promise.all([
        db.ledgerEntry.create({
          data: {
            debitAccountId: senderLedger.id,
            creditAccountId: companyCashLedger.id,
            amount: totalPaid,
            currency: 'CAD',
            transactionId,
            description: reason,
            entryType: 'PAYMENT_REVERSAL',
            enteredById,
            entryDate: new Date(),
          },
        }),
        db.ledgerAccount.update({
          where: { id: companyCashLedger.id },
          data: { balance: { decrement: totalPaid } },
        }),
        db.ledgerAccount.update({
          where: { id: senderLedger.id },
          data: { balance: { decrement: totalPaid } },
        }),
      ]);
    }

    for (const journal of remittanceJournals) {
      await journalService.reverseJournalEntry(journal.id, enteredById, reason, tx);
    }

    return { totalPaid };
  }

  // ─── recordSenderPayment ───────────────────────────────────────────────────
  // Standalone sender debt payment or credit note.
  // All writes wrapped in a single $transaction to prevent partial-write inconsistency.
  async recordSenderPayment(
    senderId: string,
    amount: number,
    paymentMethod: string,
    enteredById: string,
    type: 'DEBT_PAYMENT' | 'CREDIT_NOTE',
    notes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get or create sender ledger inside the transaction
      let senderLedger = await tx.ledgerAccount.findFirst({
        where: { accountType: LedgerAccountType.SENDER, senderId },
      });

      if (!senderLedger) {
        senderLedger = await tx.ledgerAccount.create({
          data: {
            accountType: LedgerAccountType.SENDER,
            accountName: 'Sender Ledger',
            accountCode: `SENDER-${senderId}`,   // full UUID
            senderId,
            currency: 'CAD',
            accountGroup: '1000',
            accountNumber: '1110',
          },
        });
      }

      const companyCashLedger = await tx.ledgerAccount.findFirst({
        where: { accountType: LedgerAccountType.COMPANY_CASH },
      });
      if (!companyCashLedger) throw new Error('Company cash ledger not found');

      const entryType = type === 'DEBT_PAYMENT' ? 'PAYMENT' : 'CREDIT';
      const description = notes || (type === 'DEBT_PAYMENT'
        ? `Debt payment via ${paymentMethod}`
        : `Credit note via ${paymentMethod}`);
      const ref = `PAY-${senderId.substring(0, 8)}-${Date.now()}`;

      await Promise.all([
        tx.ledgerEntry.create({
          data: {
            debitAccountId: companyCashLedger.id,
            creditAccountId: senderLedger.id,
            amount,
            currency: 'CAD',
            description,
            entryType,
            enteredById,
            entryDate: new Date(),
          },
        }),
        tx.ledgerAccount.update({
          where: { id: companyCashLedger.id },
          data: { balance: { increment: amount } },
        }),
        // Sender ledger: negative = debt, positive = credit.
        // A payment reduces debt, so increment (toward zero / positive).
        tx.ledgerAccount.update({
          where: { id: senderLedger.id },
          data: { balance: { increment: amount } },
        }),
      ]);

      // Journal inside the same tx — must succeed or everything rolls back.
      // DEBT_PAYMENT: cash collected against an existing receivable.
      //   Dr CASH-CAD          (cash in)
      //   Cr RECEIVABLE-CAD    (reduces amount owed — not income)
      // CREDIT_NOTE: company extends credit to a sender (e.g. goodwill, overpayment refund).
      //   Dr EQUITY-RETAINED-CAD  (company absorbs the cost)
      //   Cr RECEIVABLE-CAD       (increases sender's available credit)
      const lines = type === 'DEBT_PAYMENT'
        ? [
            { accountCode: 'CASH-CAD',            debit: amount, currency: 'CAD' as const, description: 'Cash collected from sender' },
            { accountCode: 'RECEIVABLE-CAD',       credit: amount, currency: 'CAD' as const, description },
          ]
        : [
            { accountCode: 'EQUITY-RETAINED-CAD', debit: amount, currency: 'CAD' as const, description },
            { accountCode: 'RECEIVABLE-CAD',       credit: amount, currency: 'CAD' as const, description: 'Credit note granted to sender' },
          ];

      await journalService.createJournalEntry({
        journalDate: new Date(),
        reference: ref,
        description,
        entryType: 'REMITTANCE_RECEIPT',
        createdById: enteredById,
        lines,
      }, tx as TxClient);
    });
  }

  // ─── recordDisbursement ────────────────────────────────────────────────────
  // Debits the teller till (or ADDITIONAL_TILL) and creates the disbursement
  // ledger entry.  The balance check and the decrement run inside the same
  // $transaction so a concurrent disbursement cannot overdraw the till.
  async recordDisbursement(
    transactionId: string,
    tellerId: string,
    ghsAmount: number,
    enteredById: string,
    tx?: TxClient,
    receivingMode?: 'CASH' | 'BANK' | 'MOMO',
    receivingPointId?: string,
    transactionCode?: string,
    codeType?: 'STANDARD' | 'ADDITIONAL',
    transactionDate?: Date
  ): Promise<void> {
    if (!tx) {
      return prisma.$transaction((innerTx) =>
        this.recordDisbursement(
          transactionId,
          tellerId,
          ghsAmount,
          enteredById,
          innerTx as TxClient,
          receivingMode,
          receivingPointId,
          transactionCode,
          codeType,
          transactionDate
        )
      );
    }

    const db = tx;

    let resolvedReceivingMode = receivingMode;
    let resolvedReceivingPointId = receivingPointId;
    let resolvedTransactionCode = transactionCode;
    let resolvedCodeType = codeType;
    let resolvedTransactionDate = transactionDate;

    if (!resolvedReceivingMode || !resolvedReceivingPointId || !resolvedTransactionCode || !resolvedCodeType) {
      const transaction = await db.transaction.findUnique({
        where: { id: transactionId },
        select: {
          receivingMode: true,
          receivingPointId: true,
          transactionCode: true,
          codeType: true,
          transactionDate: true,
        },
      });

      if (!transaction) throw new Error('Transaction not found');

      resolvedReceivingMode      = resolvedReceivingMode      ?? transaction.receivingMode;
      resolvedReceivingPointId   = resolvedReceivingPointId   ?? transaction.receivingPointId;
      resolvedTransactionCode    = resolvedTransactionCode    ?? transaction.transactionCode;
      resolvedCodeType           = resolvedCodeType           ?? transaction.codeType;
      resolvedTransactionDate    = resolvedTransactionDate    ?? transaction.transactionDate;
    }

    // ── Lock the payout account row before reading balance ──────────────────
    // Using Prisma's $queryRaw with SELECT ... FOR UPDATE ensures the balance
    // read and the subsequent decrement are serialised — no concurrent debit
    // can pass the same balance check and overdraw the account.
    let payoutAccount: { id: string; balance: Prisma.Decimal; accountCode: string } | null = null;

    if (resolvedCodeType === 'ADDITIONAL') {
      payoutAccount = await this.getOrCreateAdditionalTillAccount(db);
      // Re-read with a row lock
      const locked = await db.$queryRaw<Array<{ id: string; balance: string; accountCode: string }>>`
        SELECT id, balance, "accountCode" FROM "LedgerAccount"
        WHERE id = ${payoutAccount.id}
        FOR UPDATE
      `;
      if (!locked[0]) throw new Error('Additional till not found');
      payoutAccount = {
        id: locked[0].id,
        balance: new Prisma.Decimal(locked[0].balance),
        accountCode: locked[0].accountCode,
      };
    } else {
      const locked = await db.$queryRaw<Array<{ id: string; balance: string; accountCode: string }>>`
        SELECT id, balance, "accountCode" FROM "LedgerAccount"
        WHERE "accountType" = 'TELLER_TILL' AND "userId" = ${tellerId}
        FOR UPDATE
      `;
      if (!locked[0]) throw new Error('Teller till not found');
      payoutAccount = {
        id: locked[0].id,
        balance: new Prisma.Decimal(locked[0].balance),
        accountCode: locked[0].accountCode,
      };
    }

    // ADDITIONAL transactions are pre-funded at creation time via fundAdditionalTillForImmediateTransaction.
    // Skip the balance check for them so disbursement is never blocked by timing or float gaps.
    if (resolvedCodeType !== 'ADDITIONAL' && Number(payoutAccount.balance) < ghsAmount) {
      throw new Error(
        `Insufficient till balance. Available: GHS ${Number(payoutAccount.balance).toFixed(2)}`
      );
    }

    const expenseAccount = await this.getOrCreateDisbursementExpenseAccount(
      db,
      resolvedReceivingMode ?? 'CASH'
    );

    // Use the transaction's business date for the journal, not wall-clock now()
    const journalDate = resolvedTransactionDate ?? new Date();

    await Promise.all([
      db.ledgerEntry.create({
        data: {
          debitAccountId: expenseAccount.id,
          creditAccountId: payoutAccount.id,
          amount: ghsAmount,
          currency: 'GHS',
          transactionId,
          description: resolvedCodeType === 'ADDITIONAL'
            ? 'Immediate payment disbursed from additional till'
            : 'Payment disbursed to receivers',
          entryType: 'DISBURSEMENT',
          enteredById,
          entryDate: journalDate,
        },
      }),
      db.ledgerAccount.update({
        where: { id: payoutAccount.id },
        data: { balance: { decrement: ghsAmount } },
      }),
    ]);

    // For STANDARD transactions, also reduce the branch payable.
    // The payable (PAYABLE-GHS-{branchId}) represents the company's outstanding
    // obligation to pay receivers — it increases on sending EOD sync and decreases
    // each time a receiver is paid out.  ADDITIONAL transactions draw from the
    // dedicated ADDITIONAL_TILL which is already a separate liability pool.
    if (resolvedCodeType !== 'ADDITIONAL' && resolvedReceivingPointId) {
      const payableCode = `PAYABLE-GHS-${resolvedReceivingPointId.substring(0, 8)}`;
      const payable = await db.ledgerAccount.findUnique({
        where: { accountCode: payableCode },
        select: { id: true },
      });
      if (!payable) {
        throw new Error(
          `Payable account ${payableCode} not found. The sending side must complete an EOD sync to this branch before disbursements can be made.`
        );
      }
      await db.ledgerAccount.update({
        where: { id: payable.id },
        data: { balance: { decrement: ghsAmount } },
      });
    }

    // Journal is part of the same tx — awaited so a failed journal rolls back
    if (resolvedReceivingPointId) {
      await journalService.recordDisbursementJournal(
        payoutAccount.accountCode,
        ghsAmount,
        resolvedReceivingMode ?? 'CASH',
        transactionId,
        resolvedReceivingPointId,
        resolvedTransactionCode ?? transactionId.substring(0, 8),
        enteredById,
        journalDate,
        tx
      );
    }
  }

  // ─── fundAdditionalTillForImmediateTransaction ─────────────────────────────
  async fundAdditionalTillForImmediateTransaction(
    transactionId: string,
    ghsAmount: number,
    receivingPointId: string,
    reference: string,
    enteredById: string,
    journalDate: Date,
    tx?: TxClient
  ): Promise<void> {
    if (!tx) {
      return prisma.$transaction((innerTx) =>
        this.fundAdditionalTillForImmediateTransaction(
          transactionId,
          ghsAmount,
          receivingPointId,
          reference,
          enteredById,
          journalDate,
          innerTx as TxClient
        )
      );
    }

    const db = tx;
    const additionalTill = await this.getOrCreateAdditionalTillAccount(db);

    await db.ledgerAccount.update({
      where: { id: additionalTill.id },
      data: { balance: { increment: ghsAmount } },
    });

    // Journal inside same tx — awaited
    await journalService.recordImmediateAllocation(
      additionalTill.accountCode,
      ghsAmount,
      receivingPointId,
      reference,
      enteredById,
      journalDate,
      transactionId,
      tx
    );
  }

  // ─── loadTillFromExternal ──────────────────────────────────────────────────
  // Load teller till from an external source.  All writes inside one $transaction.
  async loadTillFromExternal(
    tellerId: string,
    amount: number,
    source: string,
    notes: string | undefined,
    enteredById: string,
    entryDate?: Date
  ) {
    return prisma.$transaction(async (tx) => {
      // Resolve teller till — never lazy-create with short UUID code
      let tellerTill = await tx.ledgerAccount.findFirst({
        where: { accountType: LedgerAccountType.TELLER_TILL, userId: tellerId },
      });

      if (!tellerTill) {
        const teller = await tx.user.findUnique({ where: { id: tellerId } });
        if (!teller) throw new Error('Teller not found');
        tellerTill = await tx.ledgerAccount.create({
          data: {
            accountType: LedgerAccountType.TELLER_TILL,
            accountName: `Till - ${teller.firstName} ${teller.lastName}`,
            accountCode: `TILL-${tellerId}`,   // full UUID
            userId: tellerId,
            currency: 'GHS',
            accountGroup: '2000',
            accountNumber: '2110',
          },
        });
      }

      // Resolve GHS clearing account. The seeded BANK-CLEARING account is CAD,
      // so till cash loads need a dedicated GHS clearing account to avoid mixing currencies.
      let clearingAccount = await tx.ledgerAccount.findUnique({
        where: { accountCode: 'BANK-CLEARING-GHS' },
      });

      if (!clearingAccount) {
        clearingAccount = await tx.ledgerAccount.create({
          data: {
            accountType: LedgerAccountType.BANK_CLEARING,
            accountName: 'Bank / External Clearing - GHS',
            accountCode: 'BANK-CLEARING-GHS',
            currency: 'GHS',
            accountGroup: '2000',
            accountNumber: '2130',
          },
        });
      }

      const description = notes || `External cash load — ${source}`;
      const ref = `LOAD-${tellerId.substring(0, 8)}-${Date.now()}`;

      const resolvedEntryDate = entryDate ?? new Date();

      const [entry] = await Promise.all([
        tx.ledgerEntry.create({
          data: {
            debitAccountId:  tellerTill.id,
            creditAccountId: clearingAccount.id,
            amount,
            currency: 'GHS',
            description,
            entryType: 'TRANSFER',
            enteredById,
            entryDate: resolvedEntryDate,
          },
        }),
        tx.ledgerAccount.update({
          where: { id: tellerTill.id },
          data: { balance: { increment: amount } },
        }),
        // Clearing account is the source — cash leaves it to fund the till
        tx.ledgerAccount.update({
          where: { id: clearingAccount.id },
          data: { balance: { decrement: amount } },
        }),
      ]);

      // Journal inside same tx — awaited
      await journalService.createJournalEntry({
        journalDate: resolvedEntryDate,
        reference: ref,
        description,
        entryType: 'VAULT_TRANSFER',
        createdById: enteredById,
        lines: [
          { accountCode: tellerTill.accountCode,     debit: amount,  currency: 'GHS', description: 'External cash loaded into till' },
          { accountCode: clearingAccount.accountCode, credit: amount, currency: 'GHS', description: 'Bank/external source' },
        ],
      }, tx as TxClient);

      return entry;
    });
  }

  // ─── vaultToTeller ─────────────────────────────────────────────────────────
  // Transfer cash from vault to teller till.
  // Validates that vault and teller are on the same branch.
  // Uses SELECT FOR UPDATE to lock the vault row so concurrent calls cannot
  // both pass the balance check and overdraw the vault.
  async vaultToTeller(
    vaultId: string,
    tellerId: string,
    amount: number,
    enteredById: string,
    notes?: string,
    tx?: TxClient,
    transferRequestId?: string | null,
    receivingPointId?: string,
    entryDate?: Date
  ): Promise<LedgerEntry> {
    if (!tx) {
      return prisma.$transaction((innerTx) =>
        this.vaultToTeller(vaultId, tellerId, amount, enteredById, notes, innerTx as TxClient, transferRequestId, receivingPointId, entryDate)
      );
    }

    const db = tx;

    // Verify vault type before locking
    const vaultMeta = await db.ledgerAccount.findUnique({
      where: { id: vaultId },
      select: { accountType: true, receivingPointId: true, accountCode: true },
    });
    if (!vaultMeta || vaultMeta.accountType !== LedgerAccountType.COMPANY_VAULT) {
      throw new Error('Invalid vault');
    }

    // Lock the vault row for the duration of this transaction
    const lockedVault = await db.$queryRaw<Array<{ id: string; balance: string; accountCode: string }>>`
      SELECT id, balance, "accountCode" FROM "LedgerAccount"
      WHERE id = ${vaultId}
      FOR UPDATE
    `;
    if (!lockedVault[0]) throw new Error('Vault not found');
    const vaultBalance = Number(lockedVault[0].balance);

    if (vaultBalance === 0) {
      throw new Error('Vault has no funds available for transfer');
    }
    if (vaultBalance < amount) {
      throw new Error(
        `Insufficient vault balance. Available: GHS ${vaultBalance.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
      );
    }

    // Get or create teller till
    let tellerTill = await db.ledgerAccount.findFirst({
      where: { accountType: LedgerAccountType.TELLER_TILL, userId: tellerId },
    });
    if (!tellerTill) {
      const teller = await db.user.findUnique({ where: { id: tellerId } });
      if (!teller) throw new Error('Teller not found');
      tellerTill = await db.ledgerAccount.create({
        data: {
          accountType: LedgerAccountType.TELLER_TILL,
          accountName: `Till - ${teller.firstName} ${teller.lastName}`,
          accountCode: `TILL-${tellerId}`,
          userId: tellerId,
          currency: 'GHS',
          accountGroup: '2000',
          accountNumber: '2110',
        },
      });
    }

    // Same-branch validation
    const resolvedRpId = receivingPointId ?? vaultMeta.receivingPointId ?? undefined;
    if (vaultMeta.receivingPointId) {
      const teller = await db.user.findUnique({
        where: { id: tellerId },
        select: { receivingPointId: true },
      });
      if (teller?.receivingPointId && teller.receivingPointId !== vaultMeta.receivingPointId) {
        throw new Error('Vault and teller belong to different branches');
      }
    }

    const ref = `VTT-${(transferRequestId ?? vaultId).substring(0, 8)}-${Date.now()}`;
    const resolvedEntryDate = entryDate ?? new Date();

    const [entry] = await Promise.all([
      db.ledgerEntry.create({
        data: {
          debitAccountId:  tellerTill.id,
          creditAccountId: vaultId,
          amount,
          currency: 'GHS',
          description: notes || 'Cash transfer from vault to teller',
          entryType: 'TRANSFER',
          enteredById,
          entryDate: resolvedEntryDate,
        },
      }),
      db.ledgerAccount.update({
        where: { id: tellerTill.id },
        data: { balance: { increment: amount } },
      }),
      db.ledgerAccount.update({
        where: { id: vaultId },
        data: { balance: { decrement: amount } },
      }),
    ]);

    if (resolvedRpId) {
      await journalService.recordVaultToTellerJournal(
        lockedVault[0].accountCode,
        tellerTill.accountCode,
        amount,
        resolvedRpId,
        ref,
        enteredById,
        transferRequestId ?? null,
        db as TxClient
      );
    }

    return entry;
  }

  // ─── tellerToVault ─────────────────────────────────────────────────────────
  // Transfer cash from teller till back to vault.
  // Uses SELECT FOR UPDATE to lock the till row so concurrent calls cannot
  // both pass the balance check and overdraw the till.
  async tellerToVault(
    tellerId: string,
    vaultId: string,
    amount: number,
    enteredById: string,
    notes?: string,
    tx?: TxClient,
    transferRequestId?: string | null,
    receivingPointId?: string,
    entryDate?: Date
  ): Promise<LedgerEntry> {
    if (!tx) {
      return prisma.$transaction((innerTx) =>
        this.tellerToVault(tellerId, vaultId, amount, enteredById, notes, innerTx as TxClient, transferRequestId, receivingPointId, entryDate)
      );
    }

    const db = tx;

    // Find the teller till first (need its id to lock)
    const tillMeta = await db.ledgerAccount.findFirst({
      where: { accountType: LedgerAccountType.TELLER_TILL, userId: tellerId },
      select: { id: true },
    });
    if (!tillMeta) throw new Error('Teller till not found');

    // Lock the till row for the duration of this transaction
    const lockedTill = await db.$queryRaw<Array<{ id: string; balance: string; accountCode: string }>>`
      SELECT id, balance, "accountCode" FROM "LedgerAccount"
      WHERE id = ${tillMeta.id}
      FOR UPDATE
    `;
    if (!lockedTill[0]) throw new Error('Teller till not found');
    const tillBalance = Number(lockedTill[0].balance);

    if (tillBalance === 0) {
      throw new Error('Teller till has no funds available for transfer');
    }
    if (tillBalance < amount) {
      throw new Error(
        `Insufficient till balance. Available: GHS ${tillBalance.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
      );
    }

    const vault = await db.ledgerAccount.findUnique({ where: { id: vaultId } });
    if (!vault || vault.accountType !== LedgerAccountType.COMPANY_VAULT) {
      throw new Error('Invalid vault');
    }

    if (receivingPointId && vault.receivingPointId && vault.receivingPointId !== receivingPointId) {
      throw new Error('Vault belongs to another branch');
    }

    const teller = await db.user.findUnique({
      where: { id: tellerId },
      select: { receivingPointId: true },
    });
    if (vault.receivingPointId && teller?.receivingPointId && teller.receivingPointId !== vault.receivingPointId) {
      throw new Error('Vault and teller belong to different branches');
    }

    const resolvedRpId = receivingPointId ?? vault.receivingPointId ?? undefined;
    const ref = `TVV-${(transferRequestId ?? vaultId).substring(0, 8)}-${Date.now()}`;
    const resolvedEntryDate = entryDate ?? new Date();

    const [entry] = await Promise.all([
      db.ledgerEntry.create({
        data: {
          debitAccountId:  vaultId,
          creditAccountId: tillMeta.id,
          amount,
          currency: 'GHS',
          description: notes || 'Cash return from teller to vault',
          entryType: 'TRANSFER',
          enteredById,
          entryDate: resolvedEntryDate,
        },
      }),
      db.ledgerAccount.update({
        where: { id: vault.id },
        data: { balance: { increment: amount } },
      }),
      db.ledgerAccount.update({
        where: { id: tillMeta.id },
        data: { balance: { decrement: amount } },
      }),
    ]);

    if (resolvedRpId) {
      await journalService.recordTellerToVaultJournal(
        lockedTill[0].accountCode,
        vault.accountCode,
        amount,
        resolvedRpId,
        ref,
        enteredById,
        transferRequestId ?? null,
        db as TxClient
      );
    }

    return entry;
  }

  // ─── getLedgerBalance ──────────────────────────────────────────────────────
  async getLedgerBalance(accountId: string) {
    const account = await prisma.ledgerAccount.findUnique({
      where: { id: accountId },
    });

    return account?.balance || 0;
  }

  async getLedgerBalanceAsOf(accountId: string, endDate: Date) {
    return this.calculateAccountBalanceFromEntries(accountId, { lte: endDate });
  }

  // ─── getLedgerStatement ────────────────────────────────────────────────────
  async getLedgerStatement(
    accountId: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const where: Prisma.LedgerEntryWhereInput = {
      OR: [
        { debitAccountId: accountId },
        { creditAccountId: accountId },
      ],
    };

    if (startDate || endDate) {
      where.entryDate = {};
      if (startDate) where.entryDate.gte = startDate;
      if (endDate)   where.entryDate.lte = endDate;
    }

    const openingBalance = startDate
      ? await this.calculateAccountBalanceFromEntries(accountId, { lt: startDate })
      : 0;

    const entries = await prisma.ledgerEntry.findMany({
      where,
      include: {
        debitAccount:  true,
        creditAccount: true,
        transaction: {
          include: {
            sender:   true,
            receiver: true,
          },
        },
        enteredBy: {
          select: {
            firstName: true,
            lastName:  true,
          },
        },
      },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    });

    // Calculate running balance
    let runningBalance = openingBalance;
    const statement = entries.map((entry) => {
      const isDebit = entry.debitAccountId === accountId;
      const amount  = Number(entry.amount);
      runningBalance += isDebit ? amount : -amount;
      return { ...entry, isDebit, runningBalance };
    });

    return statement;
  }
}
