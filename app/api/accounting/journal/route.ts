import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { getScopedReceivingPointId, requirePermission } from '@/lib/auth/permissions';
import { JournalService } from '@/lib/services/journal.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const journalService = new JournalService();

const manualJournalSchema = z.object({
  journalDate: z.string(),
  reference:   z.string().min(1),
  description: z.string().min(1),
  receivingPointId: z.string().uuid().optional().nullable(),
  lines: z.array(z.object({
    accountCode: z.string(),
    debit:       z.number().min(0).optional(),
    credit:      z.number().min(0).optional(),
    currency:    z.enum(['CAD', 'GHS']),
    description: z.string().optional(),
  })).min(2),
});

// GET /api/accounting/journal
// Paginated list of journal entries, filterable by date, type, branch, status.
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'VIEW_REPORTS');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const from             = searchParams.get('from');
    const to               = searchParams.get('to');
    const entryType        = searchParams.get('entryType');
    const status           = searchParams.get('status');
    const receivingPointId = getScopedReceivingPointId(request, searchParams.get('receivingPointId'));
    const transactionId    = searchParams.get('transactionId');
    const page             = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit            = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')));

    const where: Record<string, unknown> = {};
    if (entryType)        where.entryType = entryType;
    if (status)           where.status = status;
    if (transactionId)    where.transactionId = transactionId;
    if (receivingPointId) where.receivingPointId = receivingPointId;

    if (from || to) {
      const dateFilter: Record<string, unknown> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to)   dateFilter.lte = new Date(to + 'T23:59:59.999Z');
      where.journalDate = dateFilter;
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: { account: { select: { accountCode: true, accountName: true, currency: true } } },
          },
          receivingPoint: { select: { name: true, code: true } },
          createdBy:      { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ journalDate: 'desc' }, { createdAt: 'desc' }],
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return successResponse({
      entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Journal list error:', error);
    return errorResponse('Failed to fetch journal entries');
  }
}

// POST /api/accounting/journal
// Create a manual journal entry (MANAGE_LEDGER_ACCOUNTS only).
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_LEDGER_ACCOUNTS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const validated = manualJournalSchema.parse(body);
    const receivingPointId = getScopedReceivingPointId(
      request,
      validated.receivingPointId ?? null
    );

    const entry = await journalService.createJournalEntry({
      journalDate:     new Date(validated.journalDate),
      reference:       validated.reference,
      description:     validated.description,
      entryType:       'MANUAL',
      createdById:     userId,
      receivingPointId,
      lines:           validated.lines,
    });

    return successResponse(entry, 'Journal entry created');
  } catch (error) {
    console.error('Create journal error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create journal entry';
    return errorResponse(message);
  }
}
