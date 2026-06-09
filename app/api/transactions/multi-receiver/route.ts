import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { TransactionService } from '@/lib/services/transaction.service';
import { PaymentMethod, ReceivingMode, TransactionCodeType } from '@prisma/client';

export const dynamic = 'force-dynamic';

const transactionService = new TransactionService();

const receiverEntrySchema = z.object({
  receiverId: z.string().min(1),
  ghsAmount: z.number().positive(),
  notes: z.string().optional(),
});

const multiReceiverSchema = z.object({
  senderId: z.string().min(1),
  cadAmount: z.number().positive(),
  exchangeRateId: z.string().min(1),
  exchangeRateOverride: z.number().positive().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  amountPaidCAD: z.number().min(0),
  receivingMode: z.nativeEnum(ReceivingMode),
  receivingPointId: z.string().min(1),
  codeType: z.nativeEnum(TransactionCodeType).optional(),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankBranch: z.string().optional(),
  cashPhoneNumber: z.string().optional(),
  cashGhanaCardNumber: z.string().optional(),
  momoNumber: z.string().optional(),
  momoName: z.string().optional(),
  notes: z.string().optional(),
  receiversDeferred: z.boolean().optional(),
  receivers: z.array(receiverEntrySchema).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'CREATE_TRANSACTIONS');
    if (check.denied) return check.response;
    const createdById = check.ctx.userId;

    const body = await request.json();
    const parsed = multiReceiverSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid request', 400);
    }

    if (parsed.data.exchangeRateOverride !== undefined) {
      const overrideCheck = await requirePermission(request, 'EDIT_EXCHANGE_RATE');
      if (overrideCheck.denied) return overrideCheck.response;
    }

    const transaction = await transactionService.createMultiReceiverTransaction({
      ...parsed.data,
      transactionDate: new Date(),
      createdById,
    });

    const receiverCount = parsed.data.receiversDeferred
      ? 'receivers to be assigned at branch'
      : `${parsed.data.receivers?.length ?? 0} receivers`;

    return successResponse(
      transaction,
      `Multi-receiver transaction ${transaction.transactionCode} created — ${receiverCount}`
    );
  } catch (error) {
    console.error('Multi-receiver transaction error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create multi-receiver transaction';
    return errorResponse(message);
  }
}
