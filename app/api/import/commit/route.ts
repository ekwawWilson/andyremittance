/**
 * POST /api/import/commit — write a reviewed day-sheet into the system.
 *
 * Takes the rows the user confirmed in the review screen (which may differ from
 * what the parser produced — they can fix a mobile number or a name first) and
 * creates them as SYNCED transactions funded against the branch payable.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, ensureReceivingPointAccess } from '@/lib/auth/permissions';
import { ExcelImportService } from '@/lib/services/excel-import.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const importService = new ExcelImportService();

const commitRowSchema = z.object({
  excelRow: z.number().int(),
  senderName: z.string().min(1, 'Sender name is required'),
  receiverName: z.string().min(1, 'Receiver name is required'),
  cadAmount: z.number().positive('CAD amount must be greater than zero'),
  ghsAmount: z.number().positive('GHS amount must be greater than zero'),
  receivingMode: z.enum(['CASH', 'BANK', 'MOMO']),
  momoNumber: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  bankAccountNo: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const commitSchema = z.object({
  receivingPointId: z.string().uuid('Select a valid receiving point'),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be yyyy-mm-dd'),
  rate: z.number().positive('Exchange rate must be greater than zero'),
  rows: z.array(commitRowSchema).min(1, 'Select at least one row to import'),
  fileName: z.string().min(1),
  fileHash: z.string().min(1),
  sheetName: z.string().min(1),
  /** Set once the user has acknowledged that this file was imported before. */
  confirmReimport: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'IMPORT_TRANSACTIONS');
    if (check.denied) return check.response;

    const body = await request.json();
    const input = commitSchema.parse(body);

    // A branch-scoped user may only import into their own branch.
    const scopeError = ensureReceivingPointAccess(
      request,
      input.receivingPointId,
      'You can only import transactions for your own branch.'
    );
    if (scopeError) return scopeError;

    // Guard against silently importing the same workbook twice.
    if (!input.confirmReimport) {
      const prior = await importService.findPriorImport(input.fileHash);
      if (prior) {
        return errorResponse(
          `This file was already imported on ${prior.timestamp.toISOString().split('T')[0]} by ${prior.userName ?? 'a user'}. ` +
            'Re-submit with confirmReimport to import it again.',
          409
        );
      }
    }

    const actor = await prisma.user.findUnique({
      where: { id: check.ctx.userId },
      select: { firstName: true, lastName: true },
    });

    const result = await importService.commit({
      receivingPointId: input.receivingPointId,
      transactionDate: input.transactionDate,
      rate: input.rate,
      rows: input.rows.map((r) => ({
        excelRow: r.excelRow,
        senderName: r.senderName,
        receiverName: r.receiverName,
        cadAmount: r.cadAmount,
        ghsAmount: r.ghsAmount,
        receivingMode: r.receivingMode,
        momoNumber: r.momoNumber ?? null,
        bankName: r.bankName ?? null,
        bankAccountNo: r.bankAccountNo ?? null,
        note: r.note ?? null,
      })),
      fileName: input.fileName,
      fileHash: input.fileHash,
      sheetName: input.sheetName,
      actor: {
        userId: check.ctx.userId,
        userName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : check.ctx.userEmail,
        userRole: check.ctx.userRole,
      },
      ipAddress:
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    });

    return successResponse(
      result,
      `Imported ${result.created} transaction(s) — GHS ${result.totalGhs.toFixed(2)} allocated to the branch.`
    );
  } catch (error) {
    console.error('Import commit error:', error);
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const message = error instanceof Error ? error.message : 'Failed to import transactions';
    return errorResponse(message);
  }
}
