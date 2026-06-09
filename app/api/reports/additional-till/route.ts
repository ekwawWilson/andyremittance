import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

function buildReferenceDetails(entry: {
  paymentMode: 'CASH' | 'BANK' | 'MOMO';
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  cashPhoneNumber?: string | null;
  cashGhanaCardNumber?: string | null;
  momoNumber?: string | null;
  momoName?: string | null;
  notes?: string | null;
}) {
  if (entry.paymentMode === 'BANK') {
    return [entry.bankName, entry.bankAccountNo, entry.bankAccountName].filter(Boolean).join(' • ') || 'Bank transfer';
  }

  if (entry.paymentMode === 'CASH') {
    return [entry.cashGhanaCardNumber ? `Ghana Card: ${entry.cashGhanaCardNumber}` : null, entry.cashPhoneNumber ? `Phone: ${entry.cashPhoneNumber}` : null]
      .filter(Boolean)
      .join(' • ') || 'Cash payout';
  }

  return [entry.momoNumber ? `MoMo: ${entry.momoNumber}` : null, entry.momoName].filter(Boolean).join(' • ') || entry.notes || 'Mobile money payout';
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MARK_PAID');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const transactionType = searchParams.get('transactionType');
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));

    if (transactionType && transactionType !== 'IMMEDIATE') {
      return successResponse({ entries: [], totalGHS: 0, count: 0, accountCode: 'ADDITIONAL_TILL' });
    }

    const where: Prisma.LedgerEntryWhereInput = {
      entryType: 'DISBURSEMENT',
      creditAccount: { is: { accountCode: 'ADDITIONAL_TILL' } },
      transaction: {
        is: {
          codeType: 'ADDITIONAL',
          ...(receivingPointId ? { receivingPointId } : {}),
        },
      },
    };

    if (startDate || endDate) {
      where.entryDate = {};
      if (startDate) where.entryDate.gte = new Date(startDate);
      if (endDate) where.entryDate.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where,
      include: {
        transaction: {
          include: {
            sender: { select: { firstName: true, lastName: true } },
            receiver: { select: { firstName: true, lastName: true } },
            receivingPoint: { select: { name: true } },
            subPayments: {
              orderBy: { paidAt: 'desc' },
            },
          },
        },
      },
      orderBy: [
        { entryDate: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 500,
    });

    const entries = ledgerEntries
      .filter((entry) => entry.transaction)
      .map((entry) => {
        const transaction = entry.transaction!;
        const matchedSubPayment =
          transaction.subPayments.find((subPayment) => {
            const paidAtDiff = Math.abs(new Date(subPayment.paidAt).getTime() - new Date(entry.createdAt).getTime());
            return paidAtDiff <= 120_000 && Math.abs(Number(subPayment.ghsAmount) - Number(entry.amount)) < 0.01;
          }) ??
          transaction.subPayments.find((subPayment) => Math.abs(Number(subPayment.ghsAmount) - Number(entry.amount)) < 0.01) ??
          transaction.subPayments[0];

        const paymentMode = (matchedSubPayment?.receivingMode ?? transaction.receivingMode) as 'CASH' | 'BANK' | 'MOMO';
        const receiverName =
          matchedSubPayment?.receiverName ??
          (`${transaction.receiver?.firstName ?? ''} ${transaction.receiver?.lastName ?? ''}`.trim() || 'Receiver');

        return {
          id: entry.id,
          transactionId: transaction.id,
          transactionDate: entry.entryDate.toISOString().split('T')[0],
          transactionCode: transaction.transactionCode,
          amount: Number(entry.amount),
          paymentMode,
          referenceDetails: buildReferenceDetails({
            paymentMode,
            bankName: matchedSubPayment?.bankName ?? transaction.bankName,
            bankAccountNo: matchedSubPayment?.bankAccountNo ?? transaction.bankAccountNo,
            bankAccountName: matchedSubPayment?.bankAccountName ?? transaction.bankAccountName,
            cashPhoneNumber: matchedSubPayment?.cashPhoneNumber ?? transaction.cashPhoneNumber,
            cashGhanaCardNumber: matchedSubPayment?.cashGhanaCardNumber ?? transaction.cashGhanaCardNumber,
            momoNumber: matchedSubPayment?.momoNumber ?? transaction.momoNumber,
            momoName: matchedSubPayment?.momoName ?? transaction.momoName,
            notes: matchedSubPayment?.notes ?? transaction.notes,
          }),
          senderName: `${transaction.sender?.firstName ?? ''} ${transaction.sender?.lastName ?? ''}`.trim(),
          receiverName,
          receivingPointName: transaction.receivingPoint?.name ?? '—',
        };
      });

    return successResponse({
      entries,
      totalGHS: entries.reduce((sum, entry) => sum + entry.amount, 0),
      count: entries.length,
      accountCode: 'ADDITIONAL_TILL',
    });
  } catch (error) {
    console.error('Additional till report error:', error);
    return errorResponse('Failed to fetch additional till report');
  }
}
