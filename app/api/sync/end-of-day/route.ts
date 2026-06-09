import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { SyncService } from '@/lib/services/sync.service';
import prisma from '@/lib/db/prisma';

const syncSchema = z.object({
  date: z.string(),
});

const syncService = new SyncService();

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'SYNC_TRANSACTIONS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const validatedData = syncSchema.parse(body);

    const parsed = new Date(validatedData.date);
    const syncDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));

    const result = await syncService.endOfDaySync(syncDate);

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'END_OF_DAY_SYNC',
        entity: 'Transaction',
        changes: { date: syncDate, synced: result.synced },
      },
    });

    return successResponse(result, `${result.synced} transactions synced`);
  } catch (error) {
    console.error('End of day sync error:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return errorResponse(message);
  }
}
