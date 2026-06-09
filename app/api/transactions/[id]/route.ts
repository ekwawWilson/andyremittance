import { NextRequest } from 'next/server';
import { successResponse, errorResponse, notFoundResponse } from '@/lib/utils/api-response';
import { ensureReceivingPointAccess, requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { TransactionService } from '@/lib/services/transaction.service';
import { TransactionStatus } from '@prisma/client';

const PRE_SYNC_STATUSES: TransactionStatus[] = ['PENDING', 'PARTIAL'];

export const dynamic = 'force-dynamic';

const transactionService = new TransactionService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        sender: true,
        receiver: true,
        receivingPoint: true,
        exchangeRate: true,
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
        subPayments: {
          orderBy: { paidAt: 'desc' },
        },
        transactionReceivers: {
          include: { receiver: true },
        },
      },
    });

    if (!transaction) {
      return notFoundResponse('Transaction not found');
    }

    const accessError = ensureReceivingPointAccess(
      request,
      transaction.receivingPointId,
      'Cannot access transactions for another receiving point'
    );
    if (accessError) return accessError;

    // Ownership check mirrors the list visibility rule:
    // - Pre-sync (PENDING/PARTIAL): only the creator may view the detail
    // - Post-sync: any sending-side user may view the detail
    const userId = request.headers.get('x-user-id')!;
    const viewAll = await requirePermission(request, 'VIEW_ALL_TRANSACTIONS');
    if (viewAll.denied) {
      const isPreSync = (PRE_SYNC_STATUSES as string[]).includes(transaction.status);
      const isOwner   = transaction.createdById === userId;
      if (isPreSync && !isOwner) {
        return errorResponse('Insufficient permissions', 403);
      }
    }

    return successResponse(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    return errorResponse('Failed to fetch transaction');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'EDIT_TRANSACTIONS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.transaction.findUnique({
      where: { id },
      select: { id: true, receivingPointId: true },
    });
    if (!existing) return notFoundResponse('Transaction not found');
    const accessError = ensureReceivingPointAccess(
      request,
      existing.receivingPointId,
      'Cannot edit transactions for another receiving point'
    );
    if (accessError) return accessError;

    // codeType changes (STANDARD → ADDITIONAL) require admin role
    if ('codeType' in body && !['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'].includes(check.ctx.userRole)) {
      return errorResponse('Only admins can change the transaction type', 403);
    }

    // Whitelist editable fields
    const allowed = [
      'cadAmount', 'paymentMethod', 'amountPaidCAD', 'receivingMode',
      'receivingPointId', 'bankName', 'bankAccountNo', 'bankAccountName', 'bankBranch',
      'cashPhoneNumber', 'cashGhanaCardNumber', 'momoNumber', 'momoName', 'notes', 'senderId', 'receiverId',
      'transactionDate', 'codeType',
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Parse transactionDate string → Date
    if ('transactionDate' in updates && typeof updates.transactionDate === 'string') {
      updates.transactionDate = new Date(updates.transactionDate);
    }

    const transaction = await transactionService.updateTransaction(id, userId, updates as Parameters<typeof transactionService.updateTransaction>[2]);

    return successResponse(transaction, 'Transaction updated successfully');
  } catch (error) {
    console.error('Update transaction error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update transaction';
    return errorResponse(message);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'DELETE_TRANSACTIONS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;
    const { id } = await params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: { id: true, receivingPointId: true },
    });
    if (!transaction) return notFoundResponse('Transaction not found');
    const accessError = ensureReceivingPointAccess(
      request,
      transaction.receivingPointId,
      'Cannot cancel transactions for another receiving point'
    );
    if (accessError) return accessError;

    await transactionService.cancelTransaction(id, userId);

    return successResponse(null, 'Transaction cancelled successfully');
  } catch (error) {
    console.error('Delete transaction error:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel transaction';
    return errorResponse(message);
  }
}
