import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { LedgerService } from '@/lib/services/ledger.service';
import prisma from '@/lib/db/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'EDIT_SENDERS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const { id } = await params;
    const { amount, type, paymentMethod, notes } = await request.json();

    if (!amount || Number(amount) <= 0) return errorResponse('Amount must be positive');
    if (!['DEBT_PAYMENT', 'CREDIT_NOTE'].includes(type)) return errorResponse('Invalid payment type');
    if (!['CASH', 'E_TRANSFER'].includes(paymentMethod)) return errorResponse('Invalid payment method');

    const sender = await prisma.sender.findUnique({
      where: { id, isActive: true },
      include: { senderLedger: true },
    });
    if (!sender) return errorResponse('Sender not found', 404);

    const currentBalance = Number(sender.senderLedger?.balance ?? 0);
    const amt = Number(amount);

    if (type === 'DEBT_PAYMENT') {
      if (currentBalance >= 0) return errorResponse('Sender has no outstanding debt');
      if (amt > Math.abs(currentBalance)) return errorResponse(`Maximum payable is $${Math.abs(currentBalance).toFixed(2)}`);
    }

    const ledgerService = new LedgerService();
    await ledgerService.recordSenderPayment(id, amt, paymentMethod, userId, type, notes);

    await prisma.auditLog.create({
      data: {
        userId,
        action: type === 'DEBT_PAYMENT' ? 'SENDER_DEBT_PAYMENT' : 'SENDER_CREDIT_NOTE',
        entity: 'Sender',
        changes: { senderId: id, amount: amt, paymentMethod, notes: notes || null },
      },
    });

    return successResponse(
      { senderId: id, amount: amt, type },
      `${type === 'DEBT_PAYMENT' ? 'Debt payment' : 'Credit note'} of $${amt.toFixed(2)} recorded`
    );
  } catch (error) {
    console.error('Sender payment error:', error);
    return errorResponse('Failed to process payment');
  }
}
