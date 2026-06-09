import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/senders/:id/statement?startDate=...&endDate=...
// Returns the sender's transaction statement with running balance
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'VIEW_SENDERS');
    if (check.denied) return check.response;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Fetch sender with ledger
    const sender = await prisma.sender.findUnique({
      where: { id, isActive: true },
      include: { senderLedger: true },
    });
    if (!sender) return errorResponse('Sender not found', 404);

    // Build date filter for transactions
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    // Fetch all transactions for this sender
    const transactions = await prisma.transaction.findMany({
      where: {
        senderId: id,
        ...(Object.keys(dateFilter).length > 0 ? { transactionDate: dateFilter } : {}),
      },
      include: {
        receiver: { select: { firstName: true, lastName: true } },
        receivingPoint: { select: { name: true } },
      },
      orderBy: { transactionDate: 'asc' },
    });

    // Fetch ledger entries for debt payments and credit notes (not linked to transactions)
    const ledgerEntries = sender.senderLedger
      ? await prisma.ledgerEntry.findMany({
          where: {
            OR: [
              { debitAccountId: sender.senderLedger.id },
              { creditAccountId: sender.senderLedger.id },
            ],
            transactionId: null, // Only standalone entries (payments/credits)
            ...(Object.keys(dateFilter).length > 0 ? { entryDate: dateFilter } : {}),
          },
          include: {
            enteredBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { entryDate: 'asc' },
        })
      : [];

    // Combine and sort all entries chronologically
    type StatementEntry = {
      id: string;
      date: string;
      type: 'TRANSACTION' | 'PAYMENT' | 'CREDIT';
      status?: string;
      description: string;
      reference: string;
      debit: number;
      credit: number;
      runningBalance: number;
    };

    const entries: StatementEntry[] = [];

    // Calculate opening balance (balance before the date range)
    let openingBalance = 0;
    if (startDate) {
      // Sum all transactions before startDate
      const priorTransactions = await prisma.transaction.aggregate({
        where: {
          senderId: id,
          transactionDate: { lt: new Date(startDate) },
        },
        _sum: { cadAmount: true, amountPaidCAD: true },
      });
      const priorTxnDebit = Number(priorTransactions._sum.cadAmount ?? 0);
      const priorTxnCredit = Number(priorTransactions._sum.amountPaidCAD ?? 0);

      // Sum standalone ledger entries (payments/credits/debits) before startDate.
      // Both sides are tracked: credits reduce debt (positive effect), debits increase it (negative).
      let priorLedgerNet = 0;
      if (sender.senderLedger) {
        const priorLedger = await prisma.ledgerEntry.findMany({
          where: {
            OR: [
              { debitAccountId: sender.senderLedger.id },
              { creditAccountId: sender.senderLedger.id },
            ],
            transactionId: null,
            entryDate: { lt: new Date(startDate) },
          },
        });
        for (const entry of priorLedger) {
          const isCredit = entry.creditAccountId === sender.senderLedger.id;
          // Credit to sender ledger = reduces debt (+), debit = increases debt (-)
          priorLedgerNet += isCredit ? Number(entry.amount) : -Number(entry.amount);
        }
      }

      // Opening = transactions created debt, payments reduced debt
      openingBalance = -priorTxnDebit + priorTxnCredit + priorLedgerNet;
    }

    let runningBalance = openingBalance;

    // Add transactions as statement entries
    for (const txn of transactions) {
      const debit = Number(txn.cadAmount);
      const credit = Number(txn.amountPaidCAD);

      // Transaction creates debt (debit), payment reduces debt (credit)
      runningBalance = runningBalance - debit + credit;

      entries.push({
        id: txn.id,
        date: txn.transactionDate.toISOString().split('T')[0],
        type: 'TRANSACTION',
        status: txn.status,
        description: `${txn.receiver?.firstName ?? 'Multi'} ${txn.receiver?.lastName ?? 'Receiver'} — ${txn.receivingPoint?.name ?? 'N/A'}`,
        reference: txn.transactionCode,
        debit,
        credit,
        runningBalance,
      });
    }

    // Add ledger entries (standalone payments, credits, and any manual debit adjustments)
    for (const entry of ledgerEntries) {
      const isCredit = entry.creditAccountId === sender.senderLedger!.id;
      const amount = Number(entry.amount);

      // Credit = reduces debt (positive), debit = increases debt (negative)
      runningBalance += isCredit ? amount : -amount;
      entries.push({
        id: entry.id,
        date: entry.entryDate.toISOString().split('T')[0],
        type: entry.entryType === 'PAYMENT' ? 'PAYMENT' : 'CREDIT',
        status: entry.entryType,
        description: entry.description,
        reference: entry.entryType === 'PAYMENT' ? 'Debt Payment' : 'Credit Note',
        debit: isCredit ? 0 : amount,
        credit: isCredit ? amount : 0,
        runningBalance,
      });
    }

    // Re-sort by date after combining
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Recalculate running balance after sorting (chronological order)
    runningBalance = openingBalance;
    for (const entry of entries) {
      runningBalance = runningBalance - entry.debit + entry.credit;
      entry.runningBalance = runningBalance;
    }

    // Calculate totals
    const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);
    const closingBalance = openingBalance - totalDebits + totalCredits;

    return successResponse({
      sender: {
        id: sender.id,
        firstName: sender.firstName,
        lastName: sender.lastName,
        phone: sender.phone,
        email: sender.email,
        accountCode: sender.senderLedger?.accountCode,
        currentBalance: Number(sender.senderLedger?.balance ?? 0),
      },
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      summary: {
        openingBalance,
        totalDebits,
        totalCredits,
        closingBalance,
        transactionCount: entries.filter((e) => e.type === 'TRANSACTION').length,
        paymentCount: entries.filter((e) => e.type === 'PAYMENT' || e.type === 'CREDIT').length,
      },
      entries,
    });
  } catch (error) {
    console.error('Sender statement error:', error);
    return errorResponse('Failed to generate statement');
  }
}
