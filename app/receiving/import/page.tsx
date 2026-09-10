'use client';

/**
 * Import Day-Sheet — upload the sending side's Excel sheet and post it as
 * ready-to-disburse transactions.
 *
 * Three steps: upload → review (fix anything the parser flagged) → import.
 * Nothing is written until the user presses Import on a reviewed sheet.
 */

import { useMemo, useRef, useState } from 'react';
import {
  apiClient,
  type ImportPreview,
  type ImportRow,
  type ImportSheet,
  type ImportResult,
  type ImportReceivingMode,
} from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MODE_STYLES: Record<ImportReceivingMode, string> = {
  CASH: 'bg-slate-100 text-slate-700',
  BANK: 'bg-blue-100 text-blue-800',
  MOMO: 'bg-violet-100 text-violet-800',
};

/** Row state the user can edit before committing. */
type EditableRow = ImportRow;

/**
 * Issue codes that a row edit can resolve. Anything not listed here (rate drift,
 * already-imported, will-call) survives editing because only the server can clear it.
 */
const EDITABLE_ISSUE_CODES = new Set([
  'NO_SENDER',
  'NO_RECEIVER_NAME',
  'MOMO_LENGTH',
  'MOMO_EMPTY',
  'MOMO_PREFIX',
  'MOMO_NO_LEADING_ZERO',
  'BANK_NO_ACCOUNT',
  'BANK_NO_NAME',
  'NO_CAD',
  'NO_GHS',
]);

export default function ImportDaySheetPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Re-importing a file that was already imported must be acknowledged explicitly.
  const [ackReimport, setAckReimport] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const sheet = sheets[activeSheet] ?? null;

  // ── Derived summary for the active sheet ────────────────────────────────
  const selected = useMemo(() => (sheet ? sheet.rows.filter((r) => r.include) : []), [sheet]);
  const selectedTotals = useMemo(
    () =>
      selected.reduce(
        (acc, r) => ({ cad: acc.cad + r.cadAmount, ghs: acc.ghs + r.ghsAmount }),
        { cad: 0, ghs: 0 }
      ),
    [selected]
  );
  const blockingErrors = useMemo(
    () => selected.filter((r) => r.issues.some((i) => i.severity === 'error')),
    [selected]
  );

  // ── Upload ──────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setError('');
    setResult(null);
    setIsUploading(true);

    const res = await apiClient.previewImport(file);

    if (!res.success || !res.data) {
      setError(res.error ?? 'Could not read the file.');
      setPreview(null);
      setSheets([]);
    } else {
      setPreview(res.data);
      setSheets(res.data.sheets);
      // Land on the first sheet that actually has rows to import.
      const firstUsable = res.data.sheets.findIndex((s) => s.summary.importable > 0);
      setActiveSheet(firstUsable >= 0 ? firstUsable : 0);
    }
    setIsUploading(false);
  };

  const reset = () => {
    setPreview(null);
    setSheets([]);
    setResult(null);
    setError('');
    setActiveSheet(0);
    setAckReimport(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Row editing ─────────────────────────────────────────────────────────
  const patchSheet = (patch: Partial<ImportSheet>) => {
    setSheets((prev) => prev.map((s, i) => (i === activeSheet ? { ...s, ...patch } : s)));
  };

  /**
   * Re-derive the issues a user edit can fix or introduce, then merge them with the
   * issues only the server can judge (already-imported, rate drift, will-call).
   * Running this after every edit means switching a row to BANK immediately shows
   * the missing account number, rather than failing at commit.
   */
  const revalidate = (row: EditableRow): EditableRow['issues'] => {
    const keep = row.issues.filter((i) => !EDITABLE_ISSUE_CODES.has(i.code));
    const found: EditableRow['issues'] = [];

    if (!row.senderName.trim()) {
      found.push({ severity: 'error', code: 'NO_SENDER', message: 'Sender name is required.' });
    }
    if (!row.receiverName.trim()) {
      found.push({ severity: 'error', code: 'NO_RECEIVER_NAME', message: 'Receiver name is required.' });
    }
    if (row.receivingMode === 'MOMO' && !/^0\d{9}$/.test(row.momoNumber ?? '')) {
      found.push({
        severity: 'error',
        code: 'MOMO_LENGTH',
        message: 'Must be a 10-digit Ghana mobile number starting with 0.',
      });
    }
    if (row.receivingMode === 'BANK' && !(row.bankAccountNo ?? '').trim()) {
      found.push({ severity: 'error', code: 'BANK_NO_ACCOUNT', message: 'Bank account number is required.' });
    }
    if (row.receivingMode === 'BANK' && !(row.bankName ?? '').trim()) {
      found.push({ severity: 'warning', code: 'BANK_NO_NAME', message: 'Bank name is missing.' });
    }

    return [...keep, ...found];
  };

  const patchRow = (excelRow: number, patch: Partial<EditableRow>) => {
    setSheets((prev) =>
      prev.map((s, i) => {
        if (i !== activeSheet) return s;
        return {
          ...s,
          rows: s.rows.map((r) => {
            if (r.excelRow !== excelRow) return r;
            const next = { ...r, ...patch };
            next.issues = revalidate(next);
            // A row that no longer has an error can be selected again.
            if (next.issues.some((iss) => iss.severity === 'error')) next.include = false;
            else if (patch.include === undefined && !r.include && r.issues.some((iss) => iss.severity === 'error')) {
              next.include = true;
            }
            return next;
          }),
        };
      })
    );
  };

  const setAllIncluded = (include: boolean) => {
    setSheets((prev) =>
      prev.map((s, i) => {
        if (i !== activeSheet) return s;
        return {
          ...s,
          rows: s.rows.map((r) => ({
            ...r,
            // Never bulk-select a row that still carries an error.
            include: include ? !r.issues.some((iss) => iss.severity === 'error') : false,
          })),
        };
      })
    );
  };

  // ── Commit ──────────────────────────────────────────────────────────────
  const handleImport = async (confirmReimport = false) => {
    if (!sheet || !preview) return;
    if (!sheet.receivingPointId) { setError('Pick a branch for this sheet first.'); return; }
    if (!sheet.transactionDate) { setError('Set the business date for this sheet first.'); return; }
    if (selected.length === 0) { setError('No rows selected.'); return; }
    if (blockingErrors.length > 0) {
      setError(`${blockingErrors.length} selected row(s) still have errors. Fix or deselect them.`);
      return;
    }

    setError('');
    setIsImporting(true);
    setConfirmOpen(false);

    const res = await apiClient.commitImport({
      receivingPointId: sheet.receivingPointId,
      transactionDate: sheet.transactionDate,
      rate: sheet.existingRate ?? sheet.dominantRate ?? 0,
      sheetName: sheet.sheetName,
      fileName: preview.fileName,
      fileHash: preview.fileHash,
      confirmReimport,
      rows: selected.map((r) => ({
        excelRow: r.excelRow,
        senderName: r.senderName,
        receiverName: r.receiverName,
        cadAmount: r.cadAmount,
        ghsAmount: r.ghsAmount,
        receivingMode: r.receivingMode,
        momoNumber: r.momoNumber,
        bankName: r.bankName,
        bankAccountNo: r.bankAccountNo,
        note: r.note,
      })),
    });

    if (res.success && res.data) {
      setResult(res.data);
      // Mark this sheet as done so it can't be double-imported from the same screen.
      patchSheet({
        rows: sheet.rows.map((r) => (r.include ? { ...r, include: false } : r)),
        summary: { ...sheet.summary, importable: 0 },
      });
    } else {
      setError(res.error ?? 'Import failed.');
    }
    setIsImporting(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Day-Sheet</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload the sending side&apos;s Excel sheet. Transactions are created already synced and
          ready for tellers to disburse.
        </p>
      </div>

      {/* ── Upload ─────────────────────────────────────────────────────── */}
      {!preview && (
        <Card>
          <CardContent className="p-0">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`m-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors ${
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
              }`}
            >
              <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="mt-3 text-sm font-medium text-gray-900">
                Drop the day-sheet here, or
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="ml-1 text-blue-600 underline hover:text-blue-700"
                >
                  browse
                </button>
              </p>
              <p className="mt-1 text-xs text-gray-500">.xlsx, .xls, .xlsm or .csv — up to 10 MB</p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />

              {isUploading && <p className="mt-4 text-sm text-blue-600">Reading the sheet…</p>}
            </div>

            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 text-xs text-gray-600">
              <p className="font-medium text-gray-700">How the sheet is read</p>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                <li>The title row supplies the business date, which sets the transaction code.</li>
                <li>Each sheet tab is one branch (ACCRA, KUMASI …).</li>
                <li>A row whose TO cell starts with <code className="rounded bg-gray-200 px-1">A/C</code> carries the bank details for the row above it.</li>
                <li>A name ending in digits is a mobile money payout; a missing leading 0 is restored.</li>
                <li>Everything else is a cash payout.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* ── Result ─────────────────────────────────────────────────────── */}
      {result && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-green-100 p-2">
                <svg className="h-5 w-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  Imported {result.created} transaction{result.created === 1 ? '' : 's'}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  GHS {fmt(result.totalGhs)} allocated to the branch payable for {result.transactionDate}.
                  {result.sendersCreated > 0 && ` ${result.sendersCreated} new sender(s).`}
                  {result.receiversCreated > 0 && ` ${result.receiversCreated} new receiver(s).`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href="/receiving/pending">
                    <Button size="sm">Go to Pending Payments</Button>
                  </a>
                  <Button size="sm" variant="secondary" onClick={reset}>Import another sheet</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Review ─────────────────────────────────────────────────────── */}
      {preview && sheet && (
        <>
          {preview.priorImport && !result && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-medium">This file was imported before</span> — on{' '}
              {new Date(preview.priorImport.importedAt).toLocaleDateString()} by{' '}
              {preview.priorImport.importedBy ?? 'a user'}. Importing again will create a second set of
              transactions.
            </div>
          )}

          {preview.issues.map((issue) => (
            <div key={issue.code} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {issue.message}
            </div>
          ))}

          {/* Sheet tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-px">
            {sheets.map((s, i) => (
              <button
                key={s.sheetName}
                onClick={() => setActiveSheet(i)}
                className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  i === activeSheet
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.sheetName}
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {s.summary.importable}/{s.summary.total}
                </span>
              </button>
            ))}
            <div className="ml-auto pb-2">
              <Button size="sm" variant="ghost" onClick={reset}>Upload a different file</Button>
            </div>
          </div>

          {/* Sheet header controls */}
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500">Branch</label>
                  <select
                    value={sheet.receivingPointId ?? ''}
                    onChange={(e) => patchSheet({ receivingPointId: e.target.value || null })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">— select branch —</option>
                    {preview.receivingPoints.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500">Business date</label>
                  <input
                    type="date"
                    value={sheet.transactionDate ?? ''}
                    onChange={(e) => patchSheet({ transactionDate: e.target.value || null })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">Sets the transaction code</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500">Rate (CAD→GHS)</label>
                  <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                    {sheet.existingRate ?? sheet.dominantRate ?? '—'}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {sheet.existingRate
                      ? 'Existing rate for this date'
                      : 'From the sheet — will be saved as the day rate'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500">Selected</label>
                  <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-gray-900">{selected.length}</span>
                    <span className="text-gray-500"> of {sheet.summary.total} rows</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    CAD {fmt(selectedTotals.cad)} · GHS {selectedTotals.ghs.toLocaleString('en-US')}
                  </p>
                </div>
              </div>

              {/* Mode breakdown + sheet-level issues */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <span className="text-xs text-gray-500">Sheet title:</span>
                <span className="text-xs font-medium text-gray-700">{sheet.title || '—'}</span>
                <span className="mx-1 text-gray-300">|</span>
                <Badge variant="default">{sheet.summary.byMode.CASH} cash</Badge>
                <Badge variant="info">{sheet.summary.byMode.BANK} bank</Badge>
                <Badge variant="default">{sheet.summary.byMode.MOMO} momo</Badge>
                {sheet.summary.errors > 0 && <Badge variant="danger">{sheet.summary.errors} to fix</Badge>}
                {sheet.summary.alreadyImported > 0 && (
                  <Badge variant="warning">{sheet.summary.alreadyImported} already imported</Badge>
                )}
              </div>

              {sheet.issues.length > 0 && (
                <div className="mt-3 space-y-1">
                  {sheet.issues.map((issue, i) => (
                    <p
                      key={i}
                      className={`text-xs ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}
                    >
                      {issue.severity === 'error' ? '✕' : '!'} {issue.message}
                    </p>
                  ))}
                </div>
              )}

              {/* Reconciliation against the sheet's own TOTAL row */}
              {sheet.declaredTotals?.ghs != null && (
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-100 pt-3 text-xs">
                  <span className="text-gray-500">
                    Sheet TOTAL: CAD {fmt(sheet.declaredTotals.cad ?? 0)} · GHS {fmt(sheet.declaredTotals.ghs)}
                  </span>
                  <span className="text-gray-500">
                    Parsed: CAD {fmt(sheet.computedTotals.cad)} · GHS {fmt(sheet.computedTotals.ghsRaw)}
                  </span>
                  <span className="text-gray-500">
                    Payable after dropping pesewas: GHS {sheet.computedTotals.ghs.toLocaleString('en-US')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rows */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Rows</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAllIncluded(true)}>Select all valid</Button>
                <Button size="sm" variant="ghost" onClick={() => setAllIncluded(false)}>Clear</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="w-12 px-2 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Sender</th>
                      <th className="px-3 py-2 text-left">Receiver</th>
                      <th className="px-3 py-2 text-left">Payout</th>
                      <th className="px-3 py-2 text-right">CAD</th>
                      <th className="px-3 py-2 text-right">GHS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sheet.rows.map((row) => {
                      const hasError = row.issues.some((i) => i.severity === 'error');
                      const hasWarning = row.issues.some((i) => i.severity === 'warning');

                      return (
                        <tr
                          key={row.excelRow}
                          className={
                            hasError ? 'bg-red-50/60'
                            : hasWarning ? 'bg-amber-50/50'
                            : row.include ? '' : 'opacity-50'
                          }
                        >
                          <td className="px-3 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={row.include}
                              onChange={(e) => patchRow(row.excelRow, { include: e.target.checked })}
                              className="mt-1 h-4 w-4 rounded border-gray-300"
                            />
                          </td>

                          <td className="px-2 py-2 align-top text-xs text-gray-400">{row.excelRow}</td>

                          <td className="px-3 py-2 align-top">
                            <input
                              value={row.senderName}
                              onChange={(e) => patchRow(row.excelRow, { senderName: e.target.value })}
                              className="w-full min-w-[9rem] rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none"
                            />
                          </td>

                          <td className="px-3 py-2 align-top">
                            <input
                              value={row.receiverName}
                              onChange={(e) => patchRow(row.excelRow, { receiverName: e.target.value })}
                              placeholder="receiver name"
                              className="w-full min-w-[10rem] rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none placeholder:text-red-400"
                            />
                            {row.issues.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {row.issues.map((issue, i) => (
                                  <p
                                    key={i}
                                    className={`text-xs ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}
                                  >
                                    {issue.message}
                                  </p>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Payout details — editable per mode */}
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-start gap-2">
                              <select
                                value={row.receivingMode}
                                onChange={(e) =>
                                  patchRow(row.excelRow, { receivingMode: e.target.value as ImportReceivingMode })
                                }
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${MODE_STYLES[row.receivingMode]}`}
                              >
                                <option value="CASH">CASH</option>
                                <option value="BANK">BANK</option>
                                <option value="MOMO">MOMO</option>
                              </select>

                              <div className="min-w-[11rem] flex-1">
                                {row.receivingMode === 'MOMO' && (
                                  <>
                                    <input
                                      value={row.momoNumber ?? ''}
                                      onChange={(e) => patchRow(row.excelRow, { momoNumber: e.target.value })}
                                      placeholder="0XXXXXXXXX"
                                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 font-mono text-xs focus:border-blue-500 focus:outline-none"
                                    />
                                    {row.momoNumberRaw && row.momoNumberRaw !== row.momoNumber && (
                                      <p className="mt-0.5 text-xs text-gray-400">sheet: {row.momoNumberRaw}</p>
                                    )}
                                  </>
                                )}

                                {row.receivingMode === 'BANK' && (
                                  <div className="space-y-1">
                                    <input
                                      value={row.bankName ?? ''}
                                      onChange={(e) => patchRow(row.excelRow, { bankName: e.target.value })}
                                      placeholder="bank name"
                                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
                                    />
                                    <input
                                      value={row.bankAccountNo ?? ''}
                                      onChange={(e) => patchRow(row.excelRow, { bankAccountNo: e.target.value })}
                                      placeholder="account number"
                                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 font-mono text-xs focus:border-blue-500 focus:outline-none"
                                    />
                                    {row.bankDetailRow && (
                                      <p className="text-xs text-gray-400">from row {row.bankDetailRow}</p>
                                    )}
                                  </div>
                                )}

                                {row.receivingMode === 'CASH' && (
                                  <span className="text-xs text-gray-400">cash pickup</span>
                                )}

                                {row.note && (
                                  <p className="mt-0.5 text-xs text-gray-400">note: {row.note}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-2 text-right align-top tabular-nums">{fmt(row.cadAmount)}</td>
                          <td className="px-3 py-2 text-right align-top tabular-nums font-medium">
                            {row.ghsAmount.toLocaleString('en-US')}
                            {row.ghsRaw !== row.ghsAmount && (
                              <span className="block text-xs font-normal text-gray-400">
                                sheet {fmt(row.ghsRaw)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {sheet.rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-500">
                          No transaction rows found on this sheet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Commit bar */}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
            <div className="text-sm">
              <span className="font-semibold text-gray-900">{selected.length}</span>
              <span className="text-gray-500"> row(s) → </span>
              <span className="font-semibold text-gray-900">GHS {fmt(selectedTotals.ghs)}</span>
              {blockingErrors.length > 0 && (
                <span className="ml-3 text-red-700">{blockingErrors.length} selected row(s) still have errors</span>
              )}
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              isLoading={isImporting}
              disabled={
                selected.length === 0 ||
                blockingErrors.length > 0 ||
                !sheet.receivingPointId ||
                !sheet.transactionDate ||
                isImporting
              }
            >
              Import {selected.length} transaction{selected.length === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}

      {/* ── Confirm ────────────────────────────────────────────────────── */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm import">
        {sheet && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This creates <span className="font-semibold text-gray-900">{selected.length}</span> transaction(s)
              for <span className="font-semibold text-gray-900">{sheet.receivingPointName ?? 'the selected branch'}</span> dated{' '}
              <span className="font-semibold text-gray-900">{sheet.transactionDate}</span>. They land as
              SYNCED and are immediately payable by tellers.
            </p>

            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
              <div><dt className="text-gray-500">Total CAD</dt><dd className="font-semibold">{fmt(selectedTotals.cad)}</dd></div>
              <div><dt className="text-gray-500">Total GHS</dt><dd className="font-semibold">{selectedTotals.ghs.toLocaleString('en-US')}</dd></div>
              <div><dt className="text-gray-500">Rate</dt><dd className="font-semibold">{sheet.existingRate ?? sheet.dominantRate ?? '—'}</dd></div>
              <div><dt className="text-gray-500">Branch payable</dt><dd className="font-semibold">+GHS {selectedTotals.ghs.toLocaleString('en-US')}</dd></div>
            </dl>

            <p className="text-xs text-gray-500">
              The branch payable is credited by the GHS total, so the till can pay these out. This cannot
              be undone in bulk — individual transactions must be cancelled one at a time.
            </p>

            {preview?.priorImport && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={ackReimport}
                  onChange={(e) => setAckReimport(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400"
                />
                <span>
                  This file was already imported on{' '}
                  {new Date(preview.priorImport.importedAt).toLocaleDateString()}. I understand this
                  creates a <strong>second</strong> set of transactions.
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button
                onClick={() => handleImport(ackReimport)}
                isLoading={isImporting}
                disabled={Boolean(preview?.priorImport) && !ackReimport}
              >
                Import
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
