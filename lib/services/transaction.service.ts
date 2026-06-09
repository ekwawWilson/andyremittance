import prisma from '@/lib/db/prisma';
import { generateUniqueTransactionCode } from '@/lib/utils/transaction-code';
import { LedgerService, TxClient } from './ledger.service';
import { PaymentMethod, ReceivingMode, TransactionCodeType } from '@prisma/client';
import { DisbursementDetailsInput, normalizeDisbursementDetails } from '@/lib/validators/disbursement';

export class TransactionService {
  private ledgerService: LedgerService;

  constructor() {
    this.ledgerService = new LedgerService();
  }

  private getPendingStatus(cadAmount: number, amountPaidCAD: number): 'PENDING' | 'PARTIAL' {
    const amountPendingCAD = cadAmount - amountPaidCAD;
    return amountPendingCAD > 0 && amountPaidCAD > 0 ? 'PARTIAL' : 'PENDING';
  }

  private async assertStandardEodReady(
    db: TxClient,
    transactionDate: Date,
    codeType?: TransactionCodeType
  ) {
    if (codeType && codeType !== 'STANDARD') return;

    const txDayStartUTC = utcDayStart(transactionDate);

    const lastTxWithNoEod = await db.transaction.findFirst({
      where: {
        codeType: { not: 'ADDITIONAL' },
        transactionDate: { lt: txDayStartUTC },
        status: { not: 'CANCELLED' },
      },
      orderBy: { transactionDate: 'desc' },
      select: { transactionDate: true },
    });

    if (!lastTxWithNoEod) return;

    const prevDayStart = utcDayStart(lastTxWithNoEod.transactionDate);
    const prevDayEnd = utcDayEnd(lastTxWithNoEod.transactionDate);

    const eodRecord = await db.endOfDayRecord.findFirst({
      where: { date: { gte: prevDayStart, lte: prevDayEnd } },
    });

    if (!eodRecord) {
      const dateStr = prevDayStart.toISOString().slice(0, 10);
      throw new Error(
        `End of day for ${dateStr} has not been completed. Please close that day before entering new transactions.`
      );
    }
  }

  private async getValidatedExchangeRate(db: TxClient, exchangeRateId: string) {
    const exchangeRate = await db.exchangeRate.findUnique({
      where: { id: exchangeRateId },
    });

    if (!exchangeRate) {
      throw new Error('Exchange rate not found');
    }

    if (!exchangeRate.isActive) {
      throw new Error(
        `Exchange rate for ${new Date(exchangeRate.date).toISOString().slice(0, 10)} is no longer active. Please select the current rate.`
      );
    }

    return exchangeRate;
  }

  private async assertReceiverBelongsToSender(
    db: TxClient,
    senderId: string,
    receiverId: string
  ) {
    const receiver = await db.receiver.findUnique({
      where: { id: receiverId },
      select: { id: true, senderId: true },
    });

    if (!receiver) {
      throw new Error('Receiver not found');
    }

    if (receiver.senderId !== senderId) {
      throw new Error('Selected receiver does not belong to the selected sender');
    }
  }

  private async validateSenderCreditLimit(
    db: TxClient,
    senderId: string,
    cadAmount: number,
    amountPaidCAD: number,
    currentBalanceOverride?: number
  ) {
    const [senderLedger, sender] = await Promise.all([
      currentBalanceOverride === undefined
        ? db.ledgerAccount.findFirst({
            where: { senderId },
            select: { balance: true },
          })
        : Promise.resolve(null),
      db.sender.findUnique({
        where: { id: senderId },
        select: { creditLimit: true, firstName: true, lastName: true },
      }),
    ]);

    if (!sender) {
      throw new Error('Sender not found');
    }

    const currentBalance = currentBalanceOverride ?? (senderLedger ? Number(senderLedger.balance) : 0);
    const creditLimit = Number(sender.creditLimit);
    const unpaidAmount = cadAmount - amountPaidCAD;

    if (unpaidAmount > 0 && currentBalance - unpaidAmount < -creditLimit) {
      const available = creditLimit + currentBalance;
      throw new Error(
        `Credit limit exceeded for ${sender.firstName} ${sender.lastName}. ` +
        `Available credit: CAD ${available.toFixed(2)}, ` +
        `unpaid amount on this transaction: CAD ${unpaidAmount.toFixed(2)}.`
      );
    }
  }

  private async assertNoDuplicateSingle(
    db: TxClient,
    data: {
      senderId: string;
      receiverId: string;
      cadAmount: number;
      transactionDate: Date;
      excludeTransactionId?: string;
    }
  ) {
    const txDayStart = utcDayStart(data.transactionDate);
    const txDayEnd = utcDayEnd(data.transactionDate);

    const duplicate = await db.transaction.findFirst({
      where: {
        senderId: data.senderId,
        receiverId: data.receiverId,
        cadAmount: data.cadAmount,
        transactionDate: { gte: txDayStart, lte: txDayEnd },
        status: { not: 'CANCELLED' },
        ...(data.excludeTransactionId ? { id: { not: data.excludeTransactionId } } : {}),
      },
      select: { transactionCode: true },
    });

    if (duplicate) {
      throw new Error(
        `Duplicate transaction detected: ${duplicate.transactionCode} already exists for this sender, receiver and amount today. Cancel it first or verify before proceeding.`
      );
    }
  }

  private async validateMultiReceiverAssignments(
    db: TxClient,
    senderId: string,
    receivers: Array<{ receiverId: string; ghsAmount: number; notes?: string }>
  ) {
    const receiverIds = receivers.map((receiver) => receiver.receiverId);
    if (new Set(receiverIds).size !== receiverIds.length) {
      throw new Error('The same receiver cannot be selected more than once');
    }

    const foundReceivers = await db.receiver.findMany({
      where: { id: { in: receiverIds } },
      select: { id: true, senderId: true },
    });

    if (foundReceivers.length !== receivers.length) {
      throw new Error('One or more receivers not found');
    }

    const receiverMap = new Map(foundReceivers.map((receiver) => [receiver.id, receiver]));
    for (const receiver of receivers) {
      const linked = receiverMap.get(receiver.receiverId);
      if (!linked || linked.senderId !== senderId) {
        throw new Error('All selected receivers must belong to the selected sender');
      }
    }
  }

  private async assertNoDuplicateMulti(
    db: TxClient,
    data: {
      senderId: string;
      cadAmount: number;
      transactionDate: Date;
      receivingPointId: string;
      receiversDeferred: boolean;
      receivers?: Array<{ receiverId: string }>;
      excludeTransactionId?: string;
    }
  ) {
    const txDayStart = utcDayStart(data.transactionDate);
    const txDayEnd = utcDayEnd(data.transactionDate);

    const candidates = await db.transaction.findMany({
      where: {
        senderId: data.senderId,
        cadAmount: data.cadAmount,
        receivingPointId: data.receivingPointId,
        transactionDate: { gte: txDayStart, lte: txDayEnd },
        status: { not: 'CANCELLED' },
        receiversDeferred: data.receiversDeferred,
        ...(data.excludeTransactionId ? { id: { not: data.excludeTransactionId } } : {}),
      },
      select: {
        transactionCode: true,
        receiversDeferred: true,
        transactionReceivers: {
          select: { receiverId: true },
        },
      },
    });

    if (data.receiversDeferred) {
      if (candidates.length > 0) {
        throw new Error(
          `Duplicate transaction detected: ${candidates[0].transactionCode} already exists for this sender, amount, branch and date.`
        );
      }
      return;
    }

    const targetReceiverIds = (data.receivers ?? [])
      .map((receiver) => receiver.receiverId)
      .sort();

    const duplicate = candidates.find((candidate) => {
      const candidateIds = candidate.transactionReceivers
        .map((receiver) => receiver.receiverId)
        .filter((receiverId): receiverId is string => Boolean(receiverId))
        .sort();

      return candidateIds.length === targetReceiverIds.length &&
        candidateIds.every((receiverId, index) => receiverId === targetReceiverIds[index]);
    });

    if (duplicate) {
      throw new Error(
        `Duplicate transaction detected: ${duplicate.transactionCode} already exists for this sender, amount, receiver set and date.`
      );
    }
  }

  async createTransaction(data: {
    senderId: string;
    receiverId: string;
    cadAmount: number;
    exchangeRateId: string;
    exchangeRateOverride?: number;
    paymentMethod: PaymentMethod;
    amountPaidCAD: number;
    receivingMode: ReceivingMode;
    receivingPointId: string;
    transactionDate: Date;
    codeType?: TransactionCodeType;
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    bankBranch?: string;
    cashPhoneNumber?: string;
    cashGhanaCardNumber?: string;
    momoNumber?: string;
    momoName?: string;
    notes?: string;
    createdById: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const db = tx as TxClient;

      if (data.amountPaidCAD > data.cadAmount) {
        throw new Error('Amount paid cannot exceed total transaction amount');
      }

      if (data.receivingMode === 'BANK' && (!data.bankName || !data.bankAccountNo || !data.bankAccountName)) {
        throw new Error('Bank transactions require bank name, account number, and account name');
      }

      await this.assertStandardEodReady(db, data.transactionDate, data.codeType);
      await this.assertReceiverBelongsToSender(db, data.senderId, data.receiverId);
      await this.assertNoDuplicateSingle(db, data);
      await this.validateSenderCreditLimit(db, data.senderId, data.cadAmount, data.amountPaidCAD);

      const exchangeRate = await this.getValidatedExchangeRate(db, data.exchangeRateId);
      const effectiveRate = data.exchangeRateOverride && data.exchangeRateOverride > 0
        ? data.exchangeRateOverride
        : Number(exchangeRate.cadToGhs);
      const ghsAmount = data.cadAmount * effectiveRate;

      const transactionCode = await generateUniqueTransactionCode(
        data.transactionDate,
        data.codeType ?? 'STANDARD',
        async (candidate, shortCode) =>
          !!(await db.transaction.findFirst({
            where: {
              OR: [
                { transactionCode: candidate },
                { transactionCode: { endsWith: shortCode } },
              ],
            },
            select: { id: true },
          }))
      );

      const amountPendingCAD = data.cadAmount - data.amountPaidCAD;

      let transaction = await tx.transaction.create({
        data: {
          transactionCode,
          codeType: data.codeType || 'STANDARD',
          senderId: data.senderId,
          receiverId: data.receiverId,
          cadAmount: data.cadAmount,
          ghsAmount,
          exchangeRateId: data.exchangeRateId,
          exchangeRateUsed: effectiveRate,
          paymentMethod: data.paymentMethod,
          amountPaidCAD: data.amountPaidCAD,
          amountPendingCAD,
          receivingMode: data.receivingMode,
          receivingPointId: data.receivingPointId,
          bankName: data.receivingMode === 'BANK' ? data.bankName : null,
          bankAccountNo: data.receivingMode === 'BANK' ? data.bankAccountNo : null,
          bankAccountName: data.receivingMode === 'BANK' ? data.bankAccountName : null,
          bankBranch: data.receivingMode === 'BANK' ? data.bankBranch : null,
          cashPhoneNumber: data.receivingMode === 'CASH' ? data.cashPhoneNumber : null,
          cashGhanaCardNumber: data.receivingMode === 'CASH' ? data.cashGhanaCardNumber : null,
          momoNumber: data.receivingMode === 'MOMO' ? data.momoNumber : null,
          momoName: data.receivingMode === 'MOMO' ? data.momoName : null,
          status: this.getPendingStatus(data.cadAmount, data.amountPaidCAD),
          transactionDate: data.transactionDate,
          notes: data.notes,
          createdById: data.createdById,
        },
        include: {
          sender: true,
          receiver: true,
          receivingPoint: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: data.createdById,
          action: 'CREATE_TRANSACTION',
          entity: 'Transaction',
          entityId: transaction.id,
          changes: {
            transactionCode: transaction.transactionCode,
            cadAmount: data.cadAmount,
            ghsAmount,
            exchangeRateUsed: effectiveRate,
            senderId: data.senderId,
            receiverId: data.receiverId,
          },
        },
      });

      if (data.amountPaidCAD > 0) {
        await this.ledgerService.recordTransactionPayment(
          transaction.id,
          data.senderId,
          data.amountPaidCAD,
          data.paymentMethod,
          data.createdById,
          transaction.codeType,
          transaction.transactionCode,
          data.transactionDate,
          db
        );
      }

      if (transaction.codeType === 'ADDITIONAL') {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            syncedToReceiving: true,
            syncedAt: new Date(),
            status: 'SYNCED',
          },
        });

        await this.ledgerService.fundAdditionalTillForImmediateTransaction(
          transaction.id,
          Number(transaction.ghsAmount),
          data.receivingPointId,
          transaction.transactionCode,
          data.createdById,
          transaction.transactionDate,
          db
        );

        const senderName = `${transaction.sender.firstName} ${transaction.sender.lastName}`;
        const receiverName = transaction.receiver
          ? `${transaction.receiver.firstName} ${transaction.receiver.lastName}`
          : 'a receiver';

        await tx.notification.create({
          data: {
            receivingPointId: data.receivingPointId,
            transactionId: transaction.id,
            message: `Immediate transfer: ${senderName} → ${receiverName} — GHS ${Number(transaction.ghsAmount).toFixed(2)} (${transaction.transactionCode})`,
          },
        });

        transaction = await tx.transaction.findUniqueOrThrow({
          where: { id: transaction.id },
          include: {
            sender: true,
            receiver: true,
            receivingPoint: true,
          },
        });
      }

      return transaction;
    });
  }

  async createMultiReceiverTransaction(data: {
    senderId: string;
    cadAmount: number;
    exchangeRateId: string;
    exchangeRateOverride?: number;
    paymentMethod: PaymentMethod;
    amountPaidCAD: number;
    receivingMode: ReceivingMode;
    receivingPointId: string;
    transactionDate: Date;
    codeType?: TransactionCodeType;
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    bankBranch?: string;
    cashPhoneNumber?: string;
    cashGhanaCardNumber?: string;
    momoNumber?: string;
    momoName?: string;
    notes?: string;
    receiversDeferred?: boolean;
    receivers?: Array<{ receiverId: string; ghsAmount: number; notes?: string }>;
    createdById: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const db = tx as TxClient;
      const receiversDeferred = data.receiversDeferred ?? false;
      const receivers = data.receivers ?? [];

      if (data.amountPaidCAD > data.cadAmount) {
        throw new Error('Amount paid cannot exceed total transaction amount');
      }

      if (data.receivingMode === 'BANK' && (!data.bankName || !data.bankAccountNo || !data.bankAccountName)) {
        throw new Error('Bank transactions require bank name, account number, and account name');
      }

      if (!receiversDeferred && receivers.length < 2) {
        throw new Error('Multi-receiver transaction requires at least 2 receivers');
      }

      await this.assertStandardEodReady(db, data.transactionDate, data.codeType);
      await this.validateSenderCreditLimit(db, data.senderId, data.cadAmount, data.amountPaidCAD);

      const exchangeRate = await this.getValidatedExchangeRate(db, data.exchangeRateId);
      const effectiveRate = data.exchangeRateOverride && data.exchangeRateOverride > 0
        ? data.exchangeRateOverride
        : Number(exchangeRate.cadToGhs);
      const totalGHS = data.cadAmount * effectiveRate;

      if (!receiversDeferred) {
        const sumGHS = receivers.reduce((sum, receiver) => sum + receiver.ghsAmount, 0);
        if (Math.abs(sumGHS - totalGHS) > 0.01) {
          throw new Error(
            `Allocated GHS (${sumGHS.toFixed(2)}) must match total GHS (${totalGHS.toFixed(2)}).`
          );
        }
        await this.validateMultiReceiverAssignments(db, data.senderId, receivers);
      }

      await this.assertNoDuplicateMulti(db, {
        senderId: data.senderId,
        cadAmount: data.cadAmount,
        transactionDate: data.transactionDate,
        receivingPointId: data.receivingPointId,
        receiversDeferred,
        receivers,
      });

      const transactionCode = await generateUniqueTransactionCode(
        data.transactionDate,
        data.codeType ?? 'STANDARD',
        async (candidate, shortCode) =>
          !!(await db.transaction.findFirst({
            where: {
              OR: [
                { transactionCode: candidate },
                { transactionCode: { endsWith: shortCode } },
              ],
            },
            select: { id: true },
          }))
      );

      const amountPendingCAD = data.cadAmount - data.amountPaidCAD;

      const created = await tx.transaction.create({
        data: {
          transactionCode,
          codeType: data.codeType || 'STANDARD',
          senderId: data.senderId,
          receiverId: null, // multi-receiver: no single receiver; use TransactionReceiver rows
          cadAmount: data.cadAmount,
          ghsAmount: totalGHS,
          exchangeRateId: data.exchangeRateId,
          exchangeRateUsed: effectiveRate,
          paymentMethod: data.paymentMethod,
          amountPaidCAD: data.amountPaidCAD,
          amountPendingCAD,
          receivingMode: data.receivingMode,
          receivingPointId: data.receivingPointId,
          bankName: data.receivingMode === 'BANK' ? data.bankName : null,
          bankAccountNo: data.receivingMode === 'BANK' ? data.bankAccountNo : null,
          bankAccountName: data.receivingMode === 'BANK' ? data.bankAccountName : null,
          bankBranch: data.receivingMode === 'BANK' ? data.bankBranch : null,
          cashPhoneNumber: data.receivingMode === 'CASH' ? data.cashPhoneNumber : null,
          cashGhanaCardNumber: data.receivingMode === 'CASH' ? data.cashGhanaCardNumber : null,
          momoNumber: data.receivingMode === 'MOMO' ? data.momoNumber : null,
          momoName: data.receivingMode === 'MOMO' ? data.momoName : null,
          receiversDeferred,
          status: this.getPendingStatus(data.cadAmount, data.amountPaidCAD),
          transactionDate: data.transactionDate,
          notes: data.notes,
          createdById: data.createdById,
        },
      });

      if (!receiversDeferred && receivers.length > 0) {
        await tx.transactionReceiver.createMany({
          data: receivers.map((receiver) => ({
            transactionId: created.id,
            receiverId: receiver.receiverId,
            ghsAmount: receiver.ghsAmount,
            notes: receiver.notes,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: data.createdById,
          action: 'CREATE_MULTI_RECEIVER_TRANSACTION',
          entity: 'Transaction',
          entityId: created.id,
          changes: {
            transactionCode: created.transactionCode,
            cadAmount: data.cadAmount,
            totalGHS,
            exchangeRateUsed: effectiveRate,
            receiversDeferred,
            receiverCount: receiversDeferred ? 0 : receivers.length,
          },
        },
      });

      if (data.amountPaidCAD > 0) {
        await this.ledgerService.recordTransactionPayment(
          created.id,
          data.senderId,
          data.amountPaidCAD,
          data.paymentMethod,
          data.createdById,
          created.codeType,
          created.transactionCode,
          created.transactionDate,
          db
        );
      }

      if (created.codeType === 'ADDITIONAL') {
        await tx.transaction.update({
          where: { id: created.id },
          data: { syncedToReceiving: true, syncedAt: new Date(), status: 'SYNCED' },
        });

        await this.ledgerService.fundAdditionalTillForImmediateTransaction(
          created.id,
          Number(created.ghsAmount),
          data.receivingPointId,
          created.transactionCode,
          data.createdById,
          created.transactionDate,
          db
        );

        const sender = await tx.sender.findUnique({
          where: { id: data.senderId },
          select: { firstName: true, lastName: true },
        });
        const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'A sender';

        await tx.notification.create({
          data: {
            receivingPointId: data.receivingPointId,
            transactionId: created.id,
            message: `Immediate multi-receiver transfer: ${senderName} — GHS ${totalGHS.toFixed(2)} (${transactionCode})${receiversDeferred ? ' — receivers to be assigned at branch' : ''}`,
          },
        });
      }

      return tx.transaction.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          sender: true,
          receiver: true,
          receivingPoint: true,
          transactionReceivers: {
            include: { receiver: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });
  }

  async markAsPaid(
    transactionId: string,
    tellerId: string,
    tellerName: string,
    expectedReceivingPointId?: string | null,
    payoutDetails?: DisbursementDetailsInput
  ) {
    // Validate payout details before entering the DB transaction so we surface
    // validation errors cheaply, before any locks are acquired.
    if (payoutDetails) {
      const resolved = normalizeDisbursementDetails(payoutDetails);
      if (resolved.receivingMode === 'CASH' && (!resolved.cashGhanaCardNumber || !resolved.cashPhoneNumber)) {
        throw new Error('Cash disbursement requires Ghana Card number and phone number');
      }
      if (resolved.receivingMode === 'BANK' && (!resolved.bankName || !resolved.bankAccountNo || !resolved.bankAccountName)) {
        throw new Error('Bank disbursement requires bank name, account number, and account name');
      }
      if (resolved.receivingMode === 'MOMO' && (!resolved.momoNumber || !resolved.momoName)) {
        throw new Error('Mobile money disbursement requires MoMo number and account name');
      }
    }

    // All status checks and the financial write are inside a single $transaction.
    // The SELECT FOR UPDATE on the transaction row serialises concurrent pay requests
    // so only one can win the status check and proceed to disburse.
    const updated = await prisma.$transaction(async (tx) => {
      // Lock the transaction row before reading status — prevents double-disburse
      // under concurrent clicks from two tellers or rapid double-submit.
      const locked = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        ghsAmount: string;
        receivingPointId: string;
        receivingMode: string;
        codeType: string;
        transactionCode: string;
        bankName: string | null;
        bankAccountNo: string | null;
        bankAccountName: string | null;
        cashPhoneNumber: string | null;
        cashGhanaCardNumber: string | null;
        momoNumber: string | null;
        momoName: string | null;
      }>>`
        SELECT id, status, "ghsAmount", "receivingPointId", "receivingMode",
               "codeType", "transactionCode",
               "bankName", "bankAccountNo", "bankAccountName",
               "cashPhoneNumber", "cashGhanaCardNumber",
               "momoNumber", "momoName"
        FROM "Transaction"
        WHERE id = ${transactionId}
        FOR UPDATE
      `;

      const row = locked[0];
      if (!row) throw new Error('Transaction not found');

      if (expectedReceivingPointId && row.receivingPointId !== expectedReceivingPointId) {
        const error = new Error('Transaction belongs to another receiving point') as Error & { status?: number };
        error.status = 403;
        throw error;
      }

      if (row.status === 'PAID') throw new Error('Transaction already paid');
      if (!['SYNCED', 'PARTIAL_PAYMENT'].includes(row.status)) {
        throw new Error('Transaction must be synced before payment');
      }

      // Sub-payments read inside the same tx so the remaining amount is consistent
      const subPayments = await tx.subPayment.findMany({ where: { transactionId } });

      const resolvedPayout = normalizeDisbursementDetails(
        payoutDetails ?? {
          receivingMode: row.receivingMode as 'CASH' | 'BANK' | 'MOMO',
          bankName: row.bankName ?? undefined,
          bankAccountNo: row.bankAccountNo ?? undefined,
          bankAccountName: row.bankAccountName ?? undefined,
          cashPhoneNumber: row.cashPhoneNumber ?? undefined,
          cashGhanaCardNumber: row.cashGhanaCardNumber ?? undefined,
          momoNumber: row.momoNumber ?? undefined,
          momoName: row.momoName ?? undefined,
        }
      );

      if (resolvedPayout.receivingMode === 'CASH' && (!resolvedPayout.cashGhanaCardNumber || !resolvedPayout.cashPhoneNumber)) {
        throw new Error('Cash disbursement requires Ghana Card number and phone number');
      }
      if (resolvedPayout.receivingMode === 'BANK' && (!resolvedPayout.bankName || !resolvedPayout.bankAccountNo || !resolvedPayout.bankAccountName)) {
        throw new Error('Bank disbursement requires bank name, account number, and account name');
      }
      if (resolvedPayout.receivingMode === 'MOMO' && (!resolvedPayout.momoNumber || !resolvedPayout.momoName)) {
        throw new Error('Mobile money disbursement requires MoMo number and account name');
      }

      const amountToDisburse =
        row.status === 'PARTIAL_PAYMENT'
          ? Math.max(0, Number(row.ghsAmount) - subPayments.reduce((s, sp) => s + Number(sp.ghsAmount), 0))
          : Number(row.ghsAmount);

      if (amountToDisburse <= 0) throw new Error('No outstanding balance remains on this transaction');

      await this.ledgerService.recordDisbursement(
        transactionId,
        tellerId,
        amountToDisburse,
        tellerId,
        tx,
        resolvedPayout.receivingMode,
        row.receivingPointId,
        row.transactionCode,
        row.codeType as 'STANDARD' | 'ADDITIONAL'
      );

      return tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidBy: tellerId,
          paidByName: tellerName,
          ...resolvedPayout,
        },
        include: {
          sender: true,
          receiver: true,
          receivingPoint: true,
          subPayments: { orderBy: { paidAt: 'desc' } },
        },
      });
    });

    // Audit log is fire-and-forget; not part of the financial transaction.
    void prisma.auditLog.create({
      data: {
        userId: tellerId,
        userName: tellerName,
        action: 'MARK_TRANSACTION_PAID',
        entity: 'Transaction',
        entityId: transactionId,
        changes: {
          paidByName: tellerName,
          ghsAmount: Number(updated.ghsAmount),
          receivingMode: updated.receivingMode,
        },
      },
    }).catch((e) => console.error('Audit log error:', e));

    return updated;
  }

  async getTransactionsByDate(date: Date, receivingPointId?: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const where: {
      transactionDate: { gte: Date; lte: Date };
      receivingPointId?: string;
    } = {
      transactionDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    if (receivingPointId) {
      where.receivingPointId = receivingPointId;
    }

    return await prisma.transaction.findMany({
      where,
      include: {
        sender: true,
        receiver: true,
        receivingPoint: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTransaction(
    transactionId: string,
    userId: string,
    updates: {
      cadAmount?: number;
      paymentMethod?: PaymentMethod;
      amountPaidCAD?: number;
      receivingMode?: ReceivingMode;
      receivingPointId?: string;
      bankName?: string | null;
      bankAccountNo?: string | null;
      bankAccountName?: string | null;
      bankBranch?: string | null;
      cashPhoneNumber?: string | null;
      cashGhanaCardNumber?: string | null;
      momoNumber?: string | null;
      momoName?: string | null;
      notes?: string | null;
      senderId?: string;
      receiverId?: string | null;
      transactionDate?: Date;
      codeType?: TransactionCodeType;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const db = tx as TxClient;
      const existing = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          transactionReceivers: { select: { id: true } },
          sender: { select: { firstName: true, lastName: true } },
          receiver: { select: { firstName: true, lastName: true } },
        },
      });

      if (!existing) {
        throw new Error('Transaction not found');
      }

      if (existing.status === 'PAID') {
        throw new Error('Cannot edit a paid transaction');
      }

      if (existing.syncedToReceiving || ['SYNCED', 'PARTIAL_PAYMENT'].includes(existing.status)) {
        throw new Error('Cannot edit a synced transaction once funds have been made available to receiving');
      }

      const isMultiReceiver = existing.receiversDeferred || existing.transactionReceivers.length > 0;
      const nextCodeType = updates.codeType ?? existing.codeType;
      if (nextCodeType !== existing.codeType) {
        if (!(existing.codeType === 'STANDARD' && nextCodeType === 'ADDITIONAL')) {
          throw new Error('Only Standard transactions can be changed to Immediate');
        }
      }

      const nextSenderId = updates.senderId ?? existing.senderId;
      const nextReceiverId = isMultiReceiver ? existing.receiverId : (updates.receiverId ?? existing.receiverId);
      const nextCadAmount = updates.cadAmount ?? Number(existing.cadAmount);
      const nextAmountPaidCAD = updates.amountPaidCAD ?? Number(existing.amountPaidCAD);
      const nextPaymentMethod = updates.paymentMethod ?? existing.paymentMethod;
      const nextReceivingMode = updates.receivingMode ?? existing.receivingMode;
      const nextReceivingPointId = updates.receivingPointId ?? existing.receivingPointId;
      const nextTransactionDate = updates.transactionDate ?? existing.transactionDate;
      const effectiveRate = Number(existing.exchangeRateUsed);
      const hasUnsafeMultiChange = isMultiReceiver && (
        nextCadAmount !== Number(existing.cadAmount) ||
        nextAmountPaidCAD !== Number(existing.amountPaidCAD) ||
        nextSenderId !== existing.senderId ||
        nextReceiverId !== existing.receiverId ||
        nextReceivingPointId !== existing.receivingPointId ||
        nextTransactionDate.getTime() !== existing.transactionDate.getTime()
      );

      if (hasUnsafeMultiChange) {
        throw new Error('Editing amounts, parties, dates, or branch is not supported for multi-receiver transactions');
      }
      const requiresFinancialReplay =
        nextCodeType !== existing.codeType ||
        nextSenderId !== existing.senderId ||
        nextCadAmount !== Number(existing.cadAmount) ||
        nextAmountPaidCAD !== Number(existing.amountPaidCAD) ||
        nextPaymentMethod !== existing.paymentMethod ||
        nextTransactionDate.getTime() !== existing.transactionDate.getTime();

      if (!nextCadAmount || nextCadAmount <= 0) {
        throw new Error('CAD amount must be greater than 0');
      }

      if (nextAmountPaidCAD > nextCadAmount) {
        throw new Error('Amount paid cannot exceed total transaction amount');
      }

      const receivingFields =
        nextReceivingMode === 'BANK'
          ? {
              bankName: updates.bankName ?? existing.bankName,
              bankAccountNo: updates.bankAccountNo ?? existing.bankAccountNo,
              bankAccountName: updates.bankAccountName ?? existing.bankAccountName,
              bankBranch: updates.bankBranch ?? existing.bankBranch,
              cashPhoneNumber: null,
              cashGhanaCardNumber: null,
              momoNumber: null,
              momoName: null,
            }
          : nextReceivingMode === 'MOMO'
            ? {
                bankName: null,
                bankAccountNo: null,
                bankAccountName: null,
                bankBranch: null,
                cashPhoneNumber: null,
                cashGhanaCardNumber: null,
                momoNumber: updates.momoNumber ?? existing.momoNumber,
                momoName: updates.momoName ?? existing.momoName,
              }
            : {
                bankName: null,
                bankAccountNo: null,
                bankAccountName: null,
                bankBranch: null,
                cashPhoneNumber: updates.cashPhoneNumber ?? existing.cashPhoneNumber,
                cashGhanaCardNumber: updates.cashGhanaCardNumber ?? existing.cashGhanaCardNumber,
                momoNumber: null,
                momoName: null,
              };

      if (nextReceivingMode === 'BANK' && (!receivingFields.bankName || !receivingFields.bankAccountNo || !receivingFields.bankAccountName)) {
        throw new Error('Bank transactions require bank name, account number, and account name');
      }

      await this.assertStandardEodReady(db, nextTransactionDate, nextCodeType);

      if (!isMultiReceiver) {
        if (!nextReceiverId) {
          throw new Error('Receiver is required');
        }
        await this.assertReceiverBelongsToSender(db, nextSenderId, nextReceiverId);
        await this.assertNoDuplicateSingle(db, {
          senderId: nextSenderId,
          receiverId: nextReceiverId,
          cadAmount: nextCadAmount,
          transactionDate: nextTransactionDate,
          excludeTransactionId: existing.id,
        });
      }

      if (requiresFinancialReplay) {
        const nextSenderLedger = await tx.ledgerAccount.findFirst({
          where: { senderId: nextSenderId },
          select: { balance: true },
        });
        const baselineBalance = nextSenderId === existing.senderId
          ? Number(nextSenderLedger?.balance ?? 0) + Number(existing.amountPendingCAD)
          : Number(nextSenderLedger?.balance ?? 0);

        await this.validateSenderCreditLimit(
          db,
          nextSenderId,
          nextCadAmount,
          nextAmountPaidCAD,
          baselineBalance
        );

        await this.ledgerService.reverseTransactionPaymentAndDebt(
          existing.id,
          existing.senderId,
          Number(existing.cadAmount),
          userId,
          `Reversal before transaction update (${existing.transactionCode})`,
          db
        );
      }

      const ghsAmount = nextCadAmount * effectiveRate;
      const amountPendingCAD = nextCadAmount - nextAmountPaidCAD;

      await tx.transaction.update({
        where: { id: existing.id },
        data: {
          codeType: nextCodeType,
          senderId: nextSenderId,
          receiverId: nextReceiverId,
          cadAmount: nextCadAmount,
          ghsAmount,
          exchangeRateUsed: effectiveRate,
          paymentMethod: nextPaymentMethod,
          amountPaidCAD: nextAmountPaidCAD,
          amountPendingCAD,
          receivingMode: nextReceivingMode,
          receivingPointId: nextReceivingPointId,
          transactionDate: nextTransactionDate,
          notes: updates.notes === undefined ? existing.notes : updates.notes,
          ...receivingFields,
          status: nextCodeType === 'ADDITIONAL'
            ? 'SYNCED'
            : this.getPendingStatus(nextCadAmount, nextAmountPaidCAD),
          syncedToReceiving: nextCodeType === 'ADDITIONAL',
          syncedAt: nextCodeType === 'ADDITIONAL' ? new Date() : null,
        },
      });

      if (requiresFinancialReplay) {
        await this.ledgerService.recordTransactionPayment(
          existing.id,
          nextSenderId,
          nextAmountPaidCAD,
          nextPaymentMethod,
          userId,
          nextCodeType,
          existing.transactionCode,
          nextTransactionDate,
          db
        );
      }

      if (existing.codeType !== 'ADDITIONAL' && nextCodeType === 'ADDITIONAL') {
        await this.ledgerService.fundAdditionalTillForImmediateTransaction(
          existing.id,
          ghsAmount,
          nextReceivingPointId,
          existing.transactionCode,
          userId,
          nextTransactionDate,
          db
        );

        const senderName = nextSenderId === existing.senderId
          ? `${existing.sender.firstName} ${existing.sender.lastName}`
          : 'A sender';
        const receiverName = !isMultiReceiver && nextReceiverId
          ? nextReceiverId === existing.receiverId && existing.receiver
            ? `${existing.receiver.firstName} ${existing.receiver.lastName}`
            : 'a receiver'
          : 'receivers';

        await tx.notification.create({
          data: {
            receivingPointId: nextReceivingPointId,
            transactionId: existing.id,
            message: `Immediate transfer: ${senderName} → ${receiverName} — GHS ${ghsAmount.toFixed(2)} (${existing.transactionCode})`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE_TRANSACTION',
          entity: 'Transaction',
          entityId: existing.id,
          changes: {
            cadAmount: nextCadAmount,
            amountPaidCAD: nextAmountPaidCAD,
            amountPendingCAD,
            receivingMode: nextReceivingMode,
            receivingPointId: nextReceivingPointId,
            senderId: nextSenderId,
            receiverId: nextReceiverId,
            transactionDate: nextTransactionDate.toISOString(),
            codeType: nextCodeType,
          },
        },
      });

      return tx.transaction.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          sender: true,
          receiver: true,
          receivingPoint: true,
          exchangeRate: true,
          transactionReceivers: {
            include: { receiver: true },
          },
          subPayments: {
            orderBy: { paidAt: 'desc' },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          ledgerEntries: {
            include: {
              debitAccount: true,
              creditAccount: true,
            },
          },
        },
      });
    });
  }

  async collectRemaining(
    transactionId: string,
    userId: string,
    paymentMethod: PaymentMethod
  ) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: { sender: true, receiver: true, receivingPoint: true },
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'PARTIAL') {
        throw new Error('Only PARTIAL transactions can collect remaining balance');
      }

      const remaining = Number(transaction.amountPendingCAD);
      if (remaining <= 0) {
        throw new Error('No remaining balance on this transaction');
      }

      await this.ledgerService.recordTransactionPayment(
        transaction.id,
        transaction.senderId,
        remaining,
        paymentMethod,
        userId,
        transaction.codeType,
        transaction.transactionCode,
        transaction.transactionDate,
        tx as TxClient,
        false
      );

      const updated = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          amountPaidCAD: { increment: remaining },
          amountPendingCAD: 0,
          status: 'PENDING',
        },
        include: { sender: true, receiver: true, receivingPoint: true },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'COLLECT_REMAINING',
          entity: 'Transaction',
          entityId: transaction.id,
          changes: { collected: remaining, paymentMethod, previousStatus: 'PARTIAL', newStatus: 'PENDING' },
        },
      });

      return updated;
    });
  }

  async cancelTransaction(transactionId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status === 'PAID') {
        throw new Error('Cannot cancel a paid transaction');
      }

      if (transaction.syncedToReceiving || ['SYNCED', 'PARTIAL_PAYMENT'].includes(transaction.status)) {
        throw new Error(
          'Cannot cancel a synced transaction — it has already been funded at the receiving branch. Contact a Receiving Admin to reverse it.'
        );
      }

      await this.ledgerService.reverseTransactionPaymentAndDebt(
        transaction.id,
        transaction.senderId,
        Number(transaction.cadAmount),
        userId,
        `Reversal before cancellation (${transaction.transactionCode})`,
        tx as TxClient
      );

      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'CANCELLED',
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CANCEL_TRANSACTION',
          entity: 'Transaction',
          entityId: transactionId,
          changes: { previousStatus: transaction.status, newStatus: 'CANCELLED' },
        },
      });

      return updated;
    });
  }
}

// ── UTC date helpers ──────────────────────────────────────────────────────────
// All day-boundary comparisons use UTC so they match the database @db.Date storage
// format and the EOD record UTC-midnight convention, regardless of server timezone.

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function utcDayEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
