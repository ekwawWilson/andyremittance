import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { SyncService } from '@/lib/services/sync.service';
import { sendWhatsAppNotification } from '@/lib/services/whatsapp.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const syncService = new SyncService();

const SENDING_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'];

const closeSchema = z.object({
  date: z.string(), // YYYY-MM-DD
});

// POST /api/eod – close the day for ALL agents (SENDING_ADMIN / ADMIN / SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'SYNC_TRANSACTIONS');
    if (check.denied) return check.response;

    const { userId, userRole } = check.ctx;

    // Only sending-side admins may close the day
    if (!SENDING_ADMIN_ROLES.includes(userRole)) {
      return errorResponse('Only a Sending Admin can close end of day', 403);
    }

    const body = await request.json();
    const { date } = closeSchema.parse(body);

    // Normalise to midnight UTC for the business date
    const businessDate = new Date(date + 'T00:00:00.000Z');

    // Guard: this date must not already have an EOD record
    const existing = await prisma.endOfDayRecord.findFirst({
      where: { date: businessDate },
    });
    if (existing) {
      return errorResponse('End of day has already been closed for this date', 400);
    }

    // Create the EOD record
    const eodRecord = await prisma.endOfDayRecord.create({
      data: {
        date: businessDate,
        closedById: userId,
        syncedCount: 0,
      },
    });

    // Run the sync — atomically marks transactions SYNCED, funds vaults,
    // and stamps the EOD record ID on each transaction in a single DB transaction.
    const syncResult = await syncService.endOfDaySync(businessDate, eodRecord.id);

    // Update synced count + advance sending server date to next business day
    const nextBusinessDate = new Date(businessDate);
    nextBusinessDate.setUTCDate(nextBusinessDate.getUTCDate() + 1);

    await Promise.all([
      prisma.endOfDayRecord.update({
        where: { id: eodRecord.id },
        data: { syncedCount: syncResult.synced },
      }),
      prisma.systemConfig.upsert({
        where: { key: 'DEFAULT' },
        create: { key: 'DEFAULT', sendingServerDate: nextBusinessDate },
        update: { sendingServerDate: nextBusinessDate },
      }),
    ]);

    // Audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'END_OF_DAY_CLOSE',
        entity: 'EndOfDayRecord',
        entityId: eodRecord.id,
        changes: { date, synced: syncResult.synced } as Record<string, string | number>,
      },
    });

    // WhatsApp notification — fire-and-forget
    if (syncResult.synced > 0) {
      const totalCAD = syncResult.transactions.reduce((s, t) => s + Number(t.cadAmount), 0);
      const totalGHS = syncResult.transactions.reduce((s, t) => s + Number(t.ghsAmount), 0);
      const closedByUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const adminName = closedByUser ? `${closedByUser.firstName} ${closedByUser.lastName}` : 'Admin';
      await sendWhatsAppNotification(
        `📦 EOD Sync — ${date}\n` +
        `Closed by: ${adminName} (${userRole})\n` +
        `Transactions synced: ${syncResult.synced}\n` +
        `Total: CAD $${totalCAD.toFixed(2)} → GHS ${totalGHS.toFixed(2)}`
      );
    }

    return successResponse({
      eodRecord: {
        ...eodRecord,
        syncedCount: syncResult.synced,
      },
      transactions: syncResult.transactions,
    });
  } catch (error) {
    console.error('EOD close error:', error);
    const message = error instanceof Error ? error.message : 'Failed to close day';
    return errorResponse(message);
  }
}

// GET /api/eod – paginated EOD history
// SENDING_ADMIN/ADMIN/SUPER_ADMIN: all records
// Others: only records they are associated with via agentId filter (read-only)
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    if (!userId || !userRole) return errorResponse('Unauthorised', 401);
    const isSendingAdmin = SENDING_ADMIN_ROLES.includes(userRole);

    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    // Admins can filter by a specific agent's records; others see nothing (no close access)
    const agentIdParam = searchParams.get('agentId');
    const where: { closedById?: string } = {};
    if (isSendingAdmin && agentIdParam) {
      where.closedById = agentIdParam;
    } else if (!isSendingAdmin) {
      // Non-admins can see history but only records that touch their transactions
      // For simplicity: restrict to records closed by them (legacy agent close)
      where.closedById = userId;
    }

    const [records, total] = await Promise.all([
      prisma.endOfDayRecord.findMany({
        where,
        include: {
          closedBy: { select: { firstName: true, lastName: true } },
          transactions: {
            include: {
              sender: { select: { firstName: true, lastName: true } },
              receiver: { select: { firstName: true, lastName: true } },
              receivingPoint: { select: { name: true } },
            },
          },
        },
        orderBy: { closedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.endOfDayRecord.count({ where }),
    ]);

    return successResponse({
      records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('EOD history error:', error);
    return errorResponse('Failed to fetch end-of-day history');
  }
}
