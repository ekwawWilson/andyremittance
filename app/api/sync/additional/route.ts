import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { SyncService } from '@/lib/services/sync.service';
import { sendWhatsAppNotification } from '@/lib/services/whatsapp.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const syncService = new SyncService();

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'SYNC_TRANSACTIONS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const result = await syncService.additionalSync();

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ADDITIONAL_SYNC',
        entity: 'Transaction',
        changes: { synced: result.synced },
      },
    });

    // Fire-and-forget WhatsApp notification for each synced transaction
    if (result.synced > 0) {
      const lines = result.transactions.map((t: { transactionCode: string; sender: { firstName: string; lastName: string }; receiver: { firstName: string; lastName: string } | null; ghsAmount: unknown; receivingPoint: { name: string; code: string } }) =>
        `• ${t.transactionCode} | ${t.sender.firstName} ${t.sender.lastName} \u2192 ${t.receiver ? `${t.receiver.firstName} ${t.receiver.lastName}` : 'Multi-Receiver'} | GHS ${Number(t.ghsAmount).toFixed(2)} | ${t.receivingPoint.name}`
      );
      const message = `\u{1F4E6} Immediate (Additional) Sync — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}\n\n${lines.join('\n')}\n\nTotal: ${result.synced} transaction${result.synced !== 1 ? 's' : ''}`;
      sendWhatsAppNotification(message);
    }

    return successResponse(result, `${result.synced} additional transactions synced`);
  } catch (error) {
    console.error('Additional sync error:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return errorResponse(message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'SYNC_TRANSACTIONS');
    if (check.denied) return check.response;

    // Get pending additional transactions
    const pending = await syncService.getPendingForSync('ADDITIONAL');
    return successResponse(pending);
  } catch (error) {
    console.error('Get pending sync error:', error);
    return errorResponse('Failed to fetch pending transactions');
  }
}
