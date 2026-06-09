import { NextRequest } from 'next/server';
import { successResponse, errorResponse, notFoundResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { TransactionService } from '@/lib/services/transaction.service';
import { PaymentMethod } from '@prisma/client';

const transactionService = new TransactionService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'CREATE_TRANSACTIONS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const { id } = await params;
    const body = await request.json();
    const paymentMethod = (body.paymentMethod ?? 'CASH') as PaymentMethod;
    if (!['CASH', 'E_TRANSFER', 'SPLIT'].includes(paymentMethod)) {
      return errorResponse('Invalid payment method', 400);
    }

    const updated = await transactionService.collectRemaining(id, userId, paymentMethod);

    return successResponse(updated, 'Collected remaining balance — transaction is now PENDING');
  } catch (error) {
    console.error('Collect remaining error:', error);
    if (error instanceof Error && error.message === 'Transaction not found') {
      return notFoundResponse(error.message);
    }
    const message = error instanceof Error ? error.message : 'Failed to collect remaining balance';
    return errorResponse(message);
  }
}
