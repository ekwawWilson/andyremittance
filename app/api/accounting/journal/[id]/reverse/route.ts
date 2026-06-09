import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { JournalService } from '@/lib/services/journal.service';

export const dynamic = 'force-dynamic';

const journalService = new JournalService();

// POST /api/accounting/journal/[id]/reverse
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'MANAGE_LEDGER_ACCOUNTS');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const { id } = await params;
    const body   = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason : undefined;

    const reversal = await journalService.reverseJournalEntry(id, userId, reason);

    return successResponse(reversal, 'Journal entry reversed');
  } catch (error) {
    console.error('Reverse journal error:', error);
    const message = error instanceof Error ? error.message : 'Failed to reverse journal entry';
    return errorResponse(message);
  }
}
