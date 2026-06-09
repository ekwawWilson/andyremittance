import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { TransactionService } from '@/lib/services/transaction.service';
import prisma from '@/lib/db/prisma';
import { disbursementDetailsSchema } from '@/lib/validators/disbursement';

const transactionService = new TransactionService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const check = await requirePermission(request, 'MARK_PAID');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const receivingPointId = check.ctx.receivingPointId;

    // Get teller name
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    const tellerName = `${user.firstName} ${user.lastName}`;
    const rawBody = await request.text();

    let payoutDetails;
    if (rawBody) {
      const body = JSON.parse(rawBody);

      // If bank mode, fill in any missing bank fields from the transaction record
      // to avoid Zod failures when the transaction already has stored bank details
      if (body.receivingMode === 'BANK' && (!body.bankName || !body.bankAccountNo || !body.bankAccountName)) {
        const tx = await prisma.transaction.findUnique({
          where: { id },
          select: { bankName: true, bankAccountNo: true, bankAccountName: true },
        });
        if (tx) {
          if (!body.bankName && tx.bankName) body.bankName = tx.bankName;
          if (!body.bankAccountNo && tx.bankAccountNo) body.bankAccountNo = tx.bankAccountNo;
          if (!body.bankAccountName && tx.bankAccountName) body.bankAccountName = tx.bankAccountName;
        }
      }

      payoutDetails = disbursementDetailsSchema.parse(body);
    }

    const transaction = await transactionService.markAsPaid(
      id,
      userId,
      tellerName,
      receivingPointId,
      payoutDetails
    );

    return successResponse(transaction, 'Transaction marked as paid');
  } catch (error) {
    console.error('Mark paid error:', error);
    // ZodError: surface the first issue message in plain text
    if (typeof error === 'object' && error && 'issues' in error) {
      const issues = (error as { issues: Array<{ message: string }> }).issues;
      return errorResponse(issues[0]?.message ?? 'Validation failed', 422);
    }
    const message = error instanceof Error ? error.message : 'Failed to mark transaction as paid';
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 400;
    return errorResponse(message, status || 400);
  }
}
