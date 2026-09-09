/**
 * POST /api/import/preview — parse an uploaded sending-side day-sheet.
 *
 * Read-only: nothing is written.  Returns every sheet in the workbook with its
 * rows classified (CASH / BANK / MOMO), validation issues attached, and each row
 * checked against what is already in the database for that branch and date.
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import { parseWorkbook } from '@/lib/services/excel-import.parser';
import { ExcelImportService, hashFile } from '@/lib/services/excel-import.service';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const importService = new ExcelImportService();

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'IMPORT_TRANSACTIONS');
    if (check.denied) return check.response;

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return errorResponse('No file uploaded. Attach the day-sheet as "file".');
    }
    if (file.size === 0) {
      return errorResponse('The uploaded file is empty.');
    }
    if (file.size > MAX_FILE_BYTES) {
      return errorResponse(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
    }
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      return errorResponse('Unsupported file type. Upload an .xlsx, .xls, .xlsm or .csv file.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = hashFile(buffer);

    let parsed;
    try {
      parsed = parseWorkbook(buffer);
    } catch (err) {
      return errorResponse(
        `Could not read the workbook: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }

    // Was this exact file already imported?
    const priorImport = await importService.findPriorImport(fileHash);

    // Map sheet names onto real branches.  A branch-scoped user (teller, branch
    // manager) may only import into their own branch, so narrow the list here —
    // otherwise the review screen offers branches the commit would reject with a 403.
    const scopedReceivingPointId = request.headers.get('x-receiving-point-id');

    const receivingPoints = await prisma.receivingPoint.findMany({
      where: {
        isActive: true,
        ...(scopedReceivingPointId ? { id: scopedReceivingPointId } : {}),
      },
      select: { id: true, code: true, name: true, serverDate: true },
    });

    const branchByCode = new Map(receivingPoints.map((p) => [p.code.toUpperCase(), p]));

    const sheets = await Promise.all(
      parsed.sheets.map(async (sheet) => {
        // Match on the sheet's branch code, then fall back to a name match.
        const matched =
          (sheet.branchCode && branchByCode.get(sheet.branchCode)) ||
          receivingPoints.find(
            (p) => sheet.branchCode && p.name.toUpperCase().includes(sheet.branchCode)
          ) ||
          null;

        const issues = [...sheet.issues];
        if (!matched) {
          issues.push({
            severity: 'error',
            code: 'NO_BRANCH',
            message: scopedReceivingPointId
              ? `This sheet is for "${sheet.branchCode ?? 'another branch'}", which is outside your branch. Someone at that branch must import it.`
              : sheet.branchCode
                ? `No active receiving point matches "${sheet.branchCode}". Pick the branch manually.`
                : 'Could not determine the branch from the sheet name. Pick it manually.',
          });
        }

        // Flag rows that already exist for this branch + date.
        let rows = sheet.rows;
        if (matched && sheet.transactionDate) {
          const existing = await importService.findExistingKeys(matched.id, sheet.transactionDate);
          rows = sheet.rows.map((row) => {
            if (!existing.has(importService.rowKey(row))) return row;
            return {
              ...row,
              include: false,
              issues: [
                ...row.issues,
                {
                  severity: 'warning' as const,
                  code: 'ALREADY_IMPORTED',
                  message:
                    `A transaction for ${row.senderName} → ${row.receiverName} of CAD ${row.cadAmount.toFixed(2)} ` +
                    `already exists on ${sheet.transactionDate}. Excluded to avoid a duplicate.`,
                },
              ],
            };
          });
        }

        // Tellers' pending list defaults to the branch's own business date, so a
        // sheet dated anything else lands invisible until they widen the filter.
        if (matched && sheet.transactionDate) {
          const branchDate = matched.serverDate.toISOString().slice(0, 10);
          if (branchDate !== sheet.transactionDate) {
            issues.push({
              severity: 'warning',
              code: 'DATE_NOT_BRANCH_DATE',
              message:
                `This sheet is dated ${sheet.transactionDate} but ${matched.name} is currently on ` +
                `business date ${branchDate}. The transactions will import correctly, but tellers ` +
                `will not see them on Pending Payments until they change the date filter — or the ` +
                `branch advances its business date to ${sheet.transactionDate}.`,
            });
          }
        }

        // Does the day already have a rate? The import reuses it rather than overwriting.
        const existingRate = sheet.transactionDate
          ? await prisma.exchangeRate.findUnique({
              where: { date: new Date(`${sheet.transactionDate}T00:00:00.000Z`) },
              select: { cadToGhs: true },
            })
          : null;

        return {
          ...sheet,
          rows,
          issues,
          receivingPointId: matched?.id ?? null,
          receivingPointName: matched?.name ?? null,
          branchServerDate: matched ? matched.serverDate.toISOString().slice(0, 10) : null,
          existingRate: existingRate ? Number(existingRate.cadToGhs) : null,
          summary: {
            total: rows.length,
            // A sheet whose branch could not be resolved cannot be imported at all,
            // whatever its individual rows look like.
            importable: matched ? rows.filter((r) => r.include).length : 0,
            errors: rows.filter((r) => r.issues.some((i) => i.severity === 'error')).length,
            warnings: rows.filter((r) => r.issues.some((i) => i.severity === 'warning')).length,
            alreadyImported: rows.filter((r) => r.issues.some((i) => i.code === 'ALREADY_IMPORTED')).length,
            byMode: {
              CASH: rows.filter((r) => r.receivingMode === 'CASH').length,
              BANK: rows.filter((r) => r.receivingMode === 'BANK').length,
              MOMO: rows.filter((r) => r.receivingMode === 'MOMO').length,
            },
          },
        };
      })
    );

    return successResponse({
      fileName: file.name,
      fileHash,
      sheets,
      issues: parsed.issues,
      priorImport: priorImport
        ? {
            importedAt: priorImport.timestamp,
            importedBy: priorImport.userName,
            details: priorImport.changes,
          }
        : null,
      receivingPoints: receivingPoints.map((p) => ({ id: p.id, code: p.code, name: p.name })),
    });
  } catch (error) {
    console.error('Import preview error:', error);
    const message = error instanceof Error ? error.message : 'Failed to preview the import file';
    return errorResponse(message);
  }
}
