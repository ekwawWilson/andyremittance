'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, EndOfDayRecord, Transaction } from '@/lib/api-client';
import { TransactionStatusBadge } from '@/components/ui/Badge';

// Advance a YYYY-MM-DD string by one calendar day
function addOneDay(d: string) {
  const dt = new Date(d + 'T00:00:00.000Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().split('T')[0];
}

// ─── PDF builder ──────────────────────────────────────────────────────────────
function buildReportHTML(record: EndOfDayRecord, agentName: string): string {
  const txns = record.transactions;
  const standard = txns.filter((t) => t.codeType === 'STANDARD');
  const additional = txns.filter((t) => t.codeType === 'ADDITIONAL');
  const totalCAD = txns.reduce((s, t) => s + Number(t.cadAmount), 0);
  const totalGHS = txns.reduce((s, t) => s + Number(t.ghsAmount), 0);
  const cashCAD = txns.filter((t) => t.paymentMethod === 'CASH').reduce((s, t) => s + Number(t.cadAmount), 0);
  const eTransferCAD = txns.filter((t) => t.paymentMethod === 'E_TRANSFER').reduce((s, t) => s + Number(t.cadAmount), 0);
  const splitCAD = txns.filter((t) => t.paymentMethod === 'SPLIT').reduce((s, t) => s + Number(t.cadAmount), 0);
  const totalPaid = txns.reduce((s, t) => s + Number(t.amountPaidCAD), 0);
  const totalPending = txns.reduce((s, t) => s + Number(t.amountPendingCAD), 0);
  const dateStr = new Date(record.date).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const closedAt = new Date(record.closedAt).toLocaleString('en-CA');

  const groupRow = (label: string, rows: Transaction[]) => {
    if (!rows.length) return '';
    const sub = rows.reduce((s, t) => s + Number(t.cadAmount), 0);
    const subGHS = rows.reduce((s, t) => s + Number(t.ghsAmount), 0);
    return `
      <tr style="background:#eef2ff;font-weight:600">
        <td colspan="7" style="padding:6px 8px">${label} (${rows.length} txn${rows.length !== 1 ? 's' : ''}) — CAD $${fmtNum(sub)} | GHS ${fmtNum(subGHS)}</td>
      </tr>
      ${rows.map((t) => `<tr>
        <td style="font-family:monospace;color:#2563eb">${t.transactionCode}</td>
        <td>${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}</td>
        <td>${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}</td>
        <td>${t.receivingPoint?.name ?? ''}</td>
        <td style="text-align:right">$${fmtNum(Number(t.cadAmount))}</td>
        <td style="text-align:right">GHS ${fmtNum(Number(t.ghsAmount))}</td>
        <td>${t.receivingMode}</td>
      </tr>`).join('')}`;
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>EOD Report – ${dateStr}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:32px;color:#1f2937}
  h1{font-size:20px;margin-bottom:4px} h2{font-size:15px;margin:18px 0 6px;border-bottom:2px solid #3b82f6;padding-bottom:4px;color:#1e40af}
  .header-row{display:flex;justify-content:space-between;margin-bottom:16px} .meta{color:#6b7280;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px} th{background:#1e40af;color:#fff;text-align:left;padding:6px 8px;font-size:11px}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:12px 0}
  .box{border:1px solid #d1d5db;border-radius:6px;padding:10px}
  .box .label{font-size:10px;text-transform:uppercase;color:#6b7280} .box .value{font-size:17px;font-weight:700;margin-top:2px}
  .debt{background:#fef3c7} @media print{body{margin:24px}}
</style></head><body>
<div class="header-row"><div><h1>End-of-Day Report</h1><p class="meta">Date: <strong>${dateStr}</strong> &nbsp; Closed by: <strong>${agentName}</strong> &nbsp; At: ${closedAt}</p></div></div>
<h2>Summary</h2>
<div class="grid3">
  <div class="box"><div class="label">Total Transactions</div><div class="value">${txns.length}</div></div>
  <div class="box"><div class="label">Total CAD</div><div class="value" style="color:#16a34a">$${fmtNum(totalCAD)}</div></div>
  <div class="box"><div class="label">Total GHS</div><div class="value" style="color:#7c3aed">GHS ${fmtNum(totalGHS)}</div></div>
</div>
<h2>Payment Methods</h2>
<table><tr><th>Method</th><th style="text-align:right">CAD</th><th style="text-align:right">% of Total</th></tr>
  ${cashCAD > 0 ? `<tr><td>Cash</td><td style="text-align:right">$${fmtNum(cashCAD)}</td><td style="text-align:right">${totalCAD ? ((cashCAD / totalCAD) * 100).toFixed(1) : 0}%</td></tr>` : ''}
  ${eTransferCAD > 0 ? `<tr><td>E-Transfer</td><td style="text-align:right">$${fmtNum(eTransferCAD)}</td><td style="text-align:right">${totalCAD ? ((eTransferCAD / totalCAD) * 100).toFixed(1) : 0}%</td></tr>` : ''}
  ${splitCAD > 0 ? `<tr><td>Split</td><td style="text-align:right">$${fmtNum(splitCAD)}</td><td style="text-align:right">${totalCAD ? ((splitCAD / totalCAD) * 100).toFixed(1) : 0}%</td></tr>` : ''}
</table>
<h2>Sender Debts / Owings</h2>
<table><tr><th>Code</th><th>Sender</th><th>Receiver</th><th style="text-align:right">Total</th><th style="text-align:right">Paid</th><th style="text-align:right">Owing</th><th>Method</th></tr>
  ${txns.filter((t) => Number(t.amountPendingCAD) > 0).map((t) => `<tr class="debt">
    <td style="font-family:monospace;color:#2563eb">${t.transactionCode}</td>
    <td>${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}</td>
    <td>${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}</td>
    <td style="text-align:right">$${fmtNum(Number(t.cadAmount))}</td>
    <td style="text-align:right">$${fmtNum(Number(t.amountPaidCAD))}</td>
    <td style="text-align:right;color:#dc2626;font-weight:600">$${fmtNum(Number(t.amountPendingCAD))}</td>
    <td>${t.paymentMethod.replace('_', '-')}</td>
  </tr>`).join('')}
  <tr style="font-weight:700;background:#f3f4f6"><td colspan="4"></td><td style="text-align:right">$${fmtNum(totalPaid)}</td><td style="text-align:right;color:#dc2626">$${fmtNum(totalPending)}</td><td></td></tr>
</table>
<h2>Transactions by Type</h2>
<table><tr><th>Code</th><th>Sender</th><th>Receiver</th><th>Branch</th><th style="text-align:right">CAD</th><th style="text-align:right">GHS</th><th>Mode</th></tr>
  ${groupRow('Standard Transactions', standard)}
  ${groupRow('Immediate (Additional) Transactions', additional)}
</table>
</body></html>`;
}

function openPrintWindow(html: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ModeBadge({ mode }: { mode: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    CASH: { bg: 'bg-green-100', text: 'text-green-700' },
    BANK: { bg: 'bg-blue-100', text: 'text-blue-700' },
    MOMO: { bg: 'bg-purple-100', text: 'text-purple-700' },
  };
  const s = map[mode] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${s.bg} ${s.text}`}>
      {mode === 'CASH' ? 'Cash' : mode === 'BANK' ? 'Bank' : 'MoMo'}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EndOfDayPage() {
  const { user } = useAuth();
  const [serverDate, setServerDate] = useState<string | null>(null);
  const [serverDateLoading, setServerDateLoading] = useState(true);
  const [manualDateOpen, setManualDateOpen] = useState(false);
  const [manualDateInput, setManualDateInput] = useState('');
  const [manualDateSaving, setManualDateSaving] = useState(false);
  const [manualDateError, setManualDateError] = useState('');

  // selectedDate defaults to server date once loaded
  const [selectedDate, setSelectedDate] = useState('');

  const [history, setHistory] = useState<EndOfDayRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  const [preview, setPreview] = useState<Transaction[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [lastResult, setLastResult] = useState<{ record: EndOfDayRecord; transactions: Transaction[] } | null>(null);

  const canClose = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'].includes(user?.role ?? '');

  const loadServerDate = useCallback(async () => {
    setServerDateLoading(true);
    const res = await apiClient.getSendingServerDate();
    if (res.success && res.data) {
      const d = (res.data as { serverDate: string }).serverDate;
      setServerDate(d);
      setSelectedDate((prev) => prev || d);
      setManualDateInput(d);
    }
    setServerDateLoading(false);
  }, []);

  useEffect(() => { void loadServerDate(); }, [loadServerDate]);

  const handleManualDateSave = async () => {
    if (!manualDateInput) return;
    setManualDateSaving(true);
    setManualDateError('');
    const res = await apiClient.setSendingServerDate(manualDateInput);
    if (res.success && res.data) {
      const d = (res.data as { serverDate: string }).serverDate;
      setServerDate(d);
      setSelectedDate(d);
      setManualDateOpen(false);
    } else {
      setManualDateError(res.error || 'Failed to update server date');
    }
    setManualDateSaving(false);
  };

  const fetchHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    const res = await apiClient.getEndOfDayHistory({ page, limit: 10 });
    if (res.success && res.data) {
      setHistory(res.data.records);
      setHistoryTotalPages(res.data.pagination.totalPages || 1);
    }
    setHistoryLoading(false);
  }, []);

  const fetchPreview = useCallback(async () => {
    if (!selectedDate) return;
    setPreviewLoading(true);
    const res = await apiClient.getTransactions({ startDate: selectedDate, endDate: selectedDate, limit: 500 });
    if (res.success && res.data) setPreview(res.data.transactions);
    else setPreview([]);
    setPreviewLoading(false);
  }, [selectedDate]);

  useEffect(() => { fetchHistory(historyPage); }, [historyPage, fetchHistory]);
  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  const alreadyClosed = history.some((r) => r.date.split('T')[0] === selectedDate);
  const isServerDate = selectedDate === serverDate;

  // Derived stats
  const previewActive = preview.filter((t) => t.status !== 'CANCELLED');
  const previewStandard = previewActive.filter((t) => t.codeType === 'STANDARD');
  const previewAdditional = previewActive.filter((t) => t.codeType === 'ADDITIONAL');
  const unsynced = previewStandard.filter((t) => !t.syncedToReceiving);
  const totalCAD = previewActive.reduce((s, t) => s + Number(t.cadAmount), 0);
  const totalGHS = previewActive.reduce((s, t) => s + Number(t.ghsAmount), 0);
  const cashCAD = previewActive.filter((t) => t.paymentMethod === 'CASH').reduce((s, t) => s + Number(t.cadAmount), 0);
  const eTransferCAD = previewActive.filter((t) => t.paymentMethod === 'E_TRANSFER').reduce((s, t) => s + Number(t.cadAmount), 0);
  const splitCAD = previewActive.filter((t) => t.paymentMethod === 'SPLIT').reduce((s, t) => s + Number(t.cadAmount), 0);
  const debts = previewActive.filter((t) => Number(t.amountPendingCAD) > 0);
  const totalOwing = debts.reduce((s, t) => s + Number(t.amountPendingCAD), 0);
  const totalPaid = previewActive.reduce((s, t) => s + Number(t.amountPaidCAD), 0);

  const handleClose = async () => {
    setCloseLoading(true);
    setCloseError('');
    try {
      const res = await apiClient.closeEndOfDay(selectedDate);
      if (res.success && res.data) {
        setLastResult({ record: res.data.eodRecord, transactions: res.data.transactions });
        setConfirmOpen(false);
        setHistoryPage(1);
        // Advance server date display: closed date + 1
        const nextDate = addOneDay(selectedDate);
        setServerDate(nextDate);
        setSelectedDate(nextDate);
        setManualDateInput(nextDate);
        fetchHistory(1);
        fetchPreview();
      } else {
        setCloseError(res.error || 'Failed to close day. Please try again.');
      }
    } catch {
      setCloseError('Unexpected error. Please try again.');
    } finally {
      setCloseLoading(false);
    }
  };

  const printReport = (record: EndOfDayRecord) => {
    const agentName = record.closedBy
      ? `${record.closedBy.firstName} ${record.closedBy.lastName}`
      : user ? `${user.firstName} ${user.lastName}` : 'Agent';
    openPrintWindow(buildReportHTML(record, agentName));
  };

  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const canCloseDay = canClose && !alreadyClosed && !!selectedDate && !serverDateLoading;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">End of Day</h1>
          <p className="text-sm text-gray-400 mt-0.5">Sync standard transactions to the receiving portal</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canClose && (
            <>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setCloseError(''); setLastResult(null); }}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={!canCloseDay}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-sm ${
                  canCloseDay
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {alreadyClosed ? 'Already Closed' : 'Close Day'}
              </button>
            </>
          )}
          {!canClose && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            />
          )}
        </div>
      </div>

      {/* ─── Server Date Banner ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center gap-3 flex-1">
          <div>
            <p className="text-xs text-blue-500">Sending Portal — Current Business Date</p>
            {serverDateLoading ? (
              <div className="h-5 w-24 bg-blue-100 rounded animate-pulse mt-0.5" />
            ) : (
              <p className="text-base font-bold text-blue-900">
                {serverDate
                  ? new Date(serverDate + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })
                  : '—'}
                {isServerDate && !alreadyClosed && (
                  <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Current</span>
                )}
                {alreadyClosed && isServerDate && (
                  <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Closed</span>
                )}
              </p>
            )}
          </div>
        </div>
        {canClose && (
          <button
            onClick={() => { setManualDateOpen(true); setManualDateInput(serverDate ?? ''); setManualDateError(''); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Adjust Date
          </button>
        )}
        {!canClose && (
          <p className="text-xs text-blue-700">Transactions are dated against this business date. EOD is managed by Sending Admin.</p>
        )}
      </div>

      {/* ─── Success banner ─── */}
      {lastResult && (
        <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-green-800">Day closed successfully</p>
              <p className="text-sm text-green-700 mt-0.5">
                {lastResult.transactions.length} standard transaction{lastResult.transactions.length !== 1 ? 's' : ''} synced to the receiving portal.
              </p>
            </div>
          </div>
          <button onClick={() => printReport(lastResult.record)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-white border border-green-200 rounded-xl hover:bg-green-50 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            PDF Report
          </button>
        </div>
      )}

      {/* ─── Error ─── */}
      {closeError && !confirmOpen && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-sm text-red-700">{closeError}</p>
        </div>
      )}

      {/* ─── KPI bar ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Txns', value: previewActive.length, sub: `${previewStandard.length} std · ${previewAdditional.length} imm`, color: 'text-gray-900' },
          { label: 'CAD Collected', value: `$${fmt(totalCAD)}`, sub: `Cash $${fmt(cashCAD)} · E-T $${fmt(eTransferCAD)}`, color: 'text-green-700' },
          { label: 'GHS Sent', value: `GHS ${fmt(totalGHS)}`, sub: null, color: 'text-purple-700' },
          { label: 'Unsynced Std.', value: unsynced.length, sub: alreadyClosed ? 'Day closed' : 'pending sync', color: unsynced.length > 0 ? 'text-amber-600' : 'text-gray-400' },
          { label: 'Total Owing', value: `$${fmt(totalOwing)}`, sub: `${debts.length} sender${debts.length !== 1 ? 's' : ''}`, color: totalOwing > 0 ? 'text-red-600' : 'text-gray-400' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{previewLoading ? <span className="text-gray-300 animate-pulse">—</span> : value}</p>
            {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ─── Preview section ─── */}
      {previewLoading ? (
        <div className="flex items-center justify-center h-32 gap-3">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-gray-400">Loading transactions…</span>
        </div>
      ) : (
        <>
          {/* Payment method breakdown */}
          {previewActive.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-500 mb-3">Payment Collection (Canada)</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Cash', amount: cashCAD, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
                  { label: 'E-Transfer', amount: eTransferCAD, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
                  { label: 'Split', amount: splitCAD, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
                ].map((m) => (
                  <div key={m.label} className={`rounded-xl p-3 border ${m.bg} ${m.border} ${m.amount === 0 ? 'opacity-40' : ''}`}>
                    <p className={`text-xs font-medium ${m.text}`}>{m.label}</p>
                    <p className={`text-lg font-bold ${m.text} mt-0.5`}>${fmt(m.amount)}</p>
                    <p className={`text-[10px] ${m.text} opacity-70`}>
                      {totalCAD ? ((m.amount / totalCAD) * 100).toFixed(1) : '0'}% of total
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Debts */}
          {debts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Sender Debts / Owings</h2>
                <span className="text-xs text-red-500 font-semibold">Total owing: ${fmt(totalOwing)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      {['Code', 'Sender', 'Receiver', 'Total CAD', 'Paid', 'Owing', 'Method'].map((h) => (
                        <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {debts.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-xs text-blue-600 font-semibold">{t.transactionCode}</td>
                        <td className="py-2.5 px-4 text-gray-700 text-sm">{t.sender?.firstName} {t.sender?.lastName}</td>
                        <td className="py-2.5 px-4 text-gray-600 text-sm">{t.receiver?.firstName} {t.receiver?.lastName}</td>
                        <td className="py-2.5 px-4 font-semibold text-gray-800">${fmt(Number(t.cadAmount))}</td>
                        <td className="py-2.5 px-4 text-gray-500">${fmt(Number(t.amountPaidCAD))}</td>
                        <td className="py-2.5 px-4 font-bold text-red-600">${fmt(Number(t.amountPendingCAD))}</td>
                        <td className="py-2.5 px-4 text-xs text-gray-500">{t.paymentMethod.replace('_', '-')}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                      <td colSpan={3} className="py-2.5 px-4 text-sm text-gray-600">Totals</td>
                      <td className="py-2.5 px-4 font-bold text-gray-800">${fmt(totalCAD)}</td>
                      <td className="py-2.5 px-4 text-gray-600">${fmt(totalPaid)}</td>
                      <td className="py-2.5 px-4 font-bold text-red-600">${fmt(totalOwing)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Transactions — {dateLabel}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{previewActive.length} active · {preview.filter((t) => t.status === 'CANCELLED').length} cancelled</p>
              </div>
              {alreadyClosed && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Day Closed
                </span>
              )}
            </div>
            {previewActive.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-sm text-gray-500">No transactions for this date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      {['Code', 'Sender', 'Receiver', 'Branch', 'CAD', 'GHS', 'Mode', 'Payment', 'Status'].map((h) => (
                        <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {/* Standard group */}
                    {previewStandard.length > 0 && (
                      <>
                        <tr className="bg-indigo-50/60">
                          <td colSpan={9} className="py-2 px-4 text-xs font-semibold text-indigo-700">
                            Standard — {previewStandard.length} txn{previewStandard.length !== 1 ? 's' : ''} · ${fmt(previewStandard.reduce((s, t) => s + Number(t.cadAmount), 0))} CAD · {unsynced.length} unsynced
                          </td>
                        </tr>
                        {previewStandard.map((t) => (
                          <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 px-4 font-mono text-xs font-semibold text-blue-600">{t.transactionCode}</td>
                            <td className="py-2.5 px-4 text-gray-700 text-sm">{t.sender?.firstName} {t.sender?.lastName}</td>
                            <td className="py-2.5 px-4 text-gray-600 text-sm">{t.receiver?.firstName ?? <span className="text-amber-600 text-xs italic">Deferred</span>} {t.receiver?.lastName ?? ''}</td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">{t.receivingPoint?.name ?? '—'}</td>
                            <td className="py-2.5 px-4 font-semibold text-gray-800">${fmt(Number(t.cadAmount))}</td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">GHS {fmt(Number(t.ghsAmount))}</td>
                            <td className="py-2.5 px-4"><ModeBadge mode={t.receivingMode ?? 'CASH'} /></td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">{t.paymentMethod.replace('_', '-')}</td>
                            <td className="py-2.5 px-4">
                              <div className="flex flex-col gap-0.5">
                                <TransactionStatusBadge status={t.status} />
                                {t.syncedToReceiving && (
                                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 text-blue-700 w-fit">Synced</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                    {/* Immediate group */}
                    {previewAdditional.length > 0 && (
                      <>
                        <tr className="bg-orange-50/60">
                          <td colSpan={9} className="py-2 px-4 text-xs font-semibold text-orange-700">
                            Immediate — {previewAdditional.length} txn{previewAdditional.length !== 1 ? 's' : ''} · ${fmt(previewAdditional.reduce((s, t) => s + Number(t.cadAmount), 0))} CAD · all auto-synced
                          </td>
                        </tr>
                        {previewAdditional.map((t) => (
                          <tr key={t.id} className="hover:bg-orange-50/20 transition-colors">
                            <td className="py-2.5 px-4 font-mono text-xs font-semibold text-orange-600">{t.transactionCode}</td>
                            <td className="py-2.5 px-4 text-gray-700 text-sm">{t.sender?.firstName} {t.sender?.lastName}</td>
                            <td className="py-2.5 px-4 text-gray-600 text-sm">{t.receiver?.firstName ?? <span className="text-amber-600 text-xs italic">Deferred</span>} {t.receiver?.lastName ?? ''}</td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">{t.receivingPoint?.name ?? '—'}</td>
                            <td className="py-2.5 px-4 font-semibold text-gray-800">${fmt(Number(t.cadAmount))}</td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">GHS {fmt(Number(t.ghsAmount))}</td>
                            <td className="py-2.5 px-4"><ModeBadge mode={t.receivingMode ?? 'CASH'} /></td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">{t.paymentMethod.replace('_', '-')}</td>
                            <td className="py-2.5 px-4">
                              <div className="flex flex-col gap-0.5">
                                <TransactionStatusBadge status={t.status} />
                                {t.syncedToReceiving && (
                                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 text-blue-700 w-fit">Synced</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── History ─── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Previous EOD Closings</h2>
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center h-24 gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm text-gray-400">Loading history…</span>
          </div>
        ) : history.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/60 border-b border-gray-100">
                    {['Date', 'Closed By', 'Closed At', 'Synced', 'Report'].map((h) => (
                      <th key={h} className="text-left py-3 px-5 text-xs font-medium text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-gray-900">
                        {new Date(r.date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3.5 px-5 text-gray-700">
                        {r.closedBy ? `${r.closedBy.firstName} ${r.closedBy.lastName}` : '—'}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-gray-400">
                        {new Date(r.closedAt).toLocaleString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {r.syncedCount} txn{r.syncedCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <button onClick={() => printReport(r)}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                <span className="text-xs text-gray-400">Page {historyPage} of {historyTotalPages}</span>
                <div className="flex gap-1">
                  <button disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors">Prev</button>
                  <button disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors">Next</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <p className="text-gray-400 text-sm">No end-of-day closings yet</p>
          </div>
        )}
      </div>

      {/* ─── Confirm Modal ─── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Confirm End of Day</h2>
                <p className="text-xs text-gray-400 mt-0.5">{dateLabel}</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Standard to sync</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{unsynced.length}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Immediate (already synced)</p>
                  <p className="text-xl font-bold text-gray-500 mt-0.5">{previewAdditional.length}</p>
                </div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                This closes the day for <strong>all agents</strong>. All unsynced standard transactions will be sent to the receiving portal immediately. <strong>This cannot be undone.</strong>
              </div>
              {closeError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{closeError}</div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button type="button" onClick={() => { setConfirmOpen(false); setCloseError(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleClose} disabled={closeLoading}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2">
                {closeLoading ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Syncing…</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Close Day</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Manual Server Date Modal ─── */}
      {manualDateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Adjust Sending Server Date</h2>
                <p className="text-xs text-gray-400 mt-0.5">Manually set the current business date for the sending portal</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Business Date</label>
                <input
                  type="date"
                  value={manualDateInput}
                  onChange={(e) => setManualDateInput(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                This sets the business date that new transactions will be dated against. Use with caution — this is normally advanced automatically when you close the day.
              </div>
              {manualDateError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{manualDateError}</div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button type="button" onClick={() => setManualDateOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleManualDateSave} disabled={manualDateSaving || !manualDateInput}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2">
                {manualDateSaving ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                ) : 'Save Date'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
