'use client';
import { useEffect, useState } from 'react';
import { apiClient, EodCheckResult, EodCheckTellerStatus, ReceivingEodRecord, ReceivingPoint } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

function fmt(n: number) {
  return Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function addOneDay(d: string) {
  const dt = new Date(d + 'T00:00:00.000Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().split('T')[0];
}

function StatusPill({ tone, label }: { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }) {
  const toneClass = {
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    neutral: 'bg-gray-100 text-gray-700',
  }[tone];

  const dotClass = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    neutral: 'bg-gray-400',
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${toneClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

export default function ReceivingEodPage() {
  const { user } = useAuth();
  const [serverDate, setServerDate] = useState<string | null>(null);
  const [serverDateLoading, setServerDateLoading] = useState(false);
  const [manualDateOpen, setManualDateOpen] = useState(false);
  const [manualDateInput, setManualDateInput] = useState('');
  const [manualDateSaving, setManualDateSaving] = useState(false);
  const [manualDateError, setManualDateError] = useState('');

  const [date, setDate] = useState(todayDate());
  const [checkResult, setCheckResult] = useState<EodCheckResult | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState('');

  const [closing, setClosing] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [forceClose, setForceClose] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeSuccess, setCloseSuccess] = useState('');

  const [branches, setBranches] = useState<ReceivingPoint[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [history, setHistory] = useState<ReceivingEodRecord[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  const isBranchLocked = !!user?.receivingPoint?.id;
  const selectedBranch =
    branches.find((branch) => branch.id === selectedBranchId) ??
    (user?.receivingPoint ? user.receivingPoint : null);

  const canManageDate = ['SUPER_ADMIN', 'ADMIN', 'RECEIVING_ADMIN'].includes(user?.role ?? '');

  const loadServerDate = async (branchId: string) => {
    if (!branchId) return;
    setServerDateLoading(true);
    const res = await apiClient.getReceivingServerDate(branchId);
    if (res.success && res.data) {
      const d = (res.data as { serverDate: string }).serverDate;
      setServerDate(d);
      setDate(d);
      setManualDateInput(d);
    }
    setServerDateLoading(false);
  };

  useEffect(() => {
    if (!user) return;

    apiClient.getReceivingPoints().then((res) => {
      if (!res.success || !res.data) return;
      const scopedBranches = user.receivingPoint?.id
        ? res.data.filter((branch) => branch.id === user.receivingPoint?.id)
        : res.data;

      setBranches(scopedBranches);
      const branchId = user.receivingPoint?.id || scopedBranches[0]?.id || '';
      setSelectedBranchId((current) => current || branchId);
      if (branchId) void loadServerDate(branchId);
    });
  }, [user]);

  const runCheck = async () => {
    if (!selectedBranchId) {
      setCheckError('Select a branch before running the EOD check.');
      return;
    }
    setCheckLoading(true);
    setCheckError('');
    setCheckResult(null);
    setCloseSuccess('');
    const res = await apiClient.checkReceivingEod(date, selectedBranchId);
    if (res.success && res.data) {
      setCheckResult(res.data);
    } else {
      setCheckError(res.error || 'Failed to check EOD status');
    }
    setCheckLoading(false);
  };

  const fetchHistory = async (branchId: string) => {
    if (!branchId) {
      setHistory([]);
      setHistLoading(false);
      return;
    }
    setHistLoading(true);
    const res = await apiClient.getReceivingEodHistory({ receivingPointId: branchId });
    if (res.success && res.data) setHistory((res.data as { records: ReceivingEodRecord[] }).records ?? []);
    setHistLoading(false);
  };

  useEffect(() => {
    if (!selectedBranchId) return;
    void fetchHistory(selectedBranchId);
  }, [selectedBranchId]);

  const handleClose = async () => {
    if (!selectedBranchId) {
      setCloseError('Select a branch before closing EOD.');
      return;
    }
    setClosing(true);
    setCloseError('');
    setCloseSuccess('');
    const res = await apiClient.closeReceivingEod({
      date,
      notes: closeNotes || undefined,
      forceClose,
      receivingPointId: selectedBranchId,
    });
    if (res.success && res.data) {
      const d = res.data as { totalDisbursed: number; disbursementCount: number; reconciliationsReady: number };
      setCloseSuccess(
        `Branch EOD closed for ${selectedBranch?.name ?? 'the selected branch'}. GHS ${fmt(d.totalDisbursed)} disbursed across ${d.disbursementCount} transaction(s). ${d.reconciliationsReady} reconciliation(s) were ready for close.`
      );
      // Advance server date display: closed date + 1
      const nextDate = addOneDay(date);
      setServerDate(nextDate);
      setDate(nextDate);
      setManualDateInput(nextDate);
      setCloseNotes('');
      setForceClose(false);
      setCheckResult(null);
      void fetchHistory(selectedBranchId);
    } else {
      setCloseError(res.error || 'Failed to close branch EOD');
    }
    setClosing(false);
  };

  const handleManualDateSave = async () => {
    if (!manualDateInput || !selectedBranchId) return;
    setManualDateSaving(true);
    setManualDateError('');
    const res = await apiClient.setReceivingServerDate({ date: manualDateInput, receivingPointId: selectedBranchId });
    if (res.success && res.data) {
      const d = (res.data as { serverDate: string }).serverDate;
      setServerDate(d);
      setDate(d);
      setManualDateOpen(false);
    } else {
      setManualDateError(res.error || 'Failed to update server date');
    }
    setManualDateSaving(false);
  };

  const handleExportPdf = (record: ReceivingEodRecord) => {
    const tellerRows = (checkResult?.tellerStatus ?? []).map((t: EodCheckTellerStatus) => `
      <tr>
        <td>${t.tellerName}</td>
        <td style="text-align:center">${t.hasSubmitted ? '&#10003;' : '&#10007;'}</td>
        <td style="text-align:right">GHS ${fmt(t.tillBalance)}</td>
        <td style="text-align:right;color:${!t.reconciliation ? '#999' : Number(t.reconciliation.variance) === 0 ? '#059669' : '#dc2626'}">
          ${t.reconciliation ? (Number(t.reconciliation.variance) > 0 ? '+' : '') + fmt(t.reconciliation.variance) : '—'}
        </td>
      </tr>`).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Branch EOD — ${new Date(record.date).toLocaleDateString('en-GH')}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 24px; color: #111; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb; }
          .header h1 { font-size: 20px; margin: 0 0 4px; }
          .header .meta { color: #555; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
          .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
          .card label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px; }
          .card span { font-size: 18px; font-weight: 700; color: #111; }
          h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 20px 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f9fafb; text-align: left; padding: 8px 10px; border-bottom: 2px solid #e5e7eb; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
          td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #888; display: flex; justify-content: space-between; }
          @media print { button { display: none !important; } body { padding: 16px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Branch End-of-Day Report</h1>
            <p class="meta">Business Date: <strong>${new Date(record.date + 'T00:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
            <p class="meta">Branch: <strong>${record.receivingPoint?.name ?? selectedBranch?.name ?? 'Receiving branch'}</strong></p>
          </div>
          <div style="text-align:right">
            <p class="meta">Closed by: <strong>${record.closedBy?.firstName ?? ''} ${record.closedBy?.lastName ?? ''}</strong></p>
            <p class="meta">Closed at: <strong>${new Date(record.closedAt).toLocaleString('en-GH')}</strong></p>
            <p class="meta">Generated: ${new Date().toLocaleString('en-GH')}</p>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <label>Total Disbursed</label>
            <span>GHS ${fmt(record.totalDisbursed)}</span>
          </div>
          <div class="card">
            <label>Transactions Paid</label>
            <span>${record.disbursementCount}</span>
          </div>
          ${record.notes ? `<div class="card" style="grid-column: span 2"><label>Notes</label><span style="font-size:13px">${record.notes}</span></div>` : ''}
        </div>

        ${tellerRows ? `
        <h2>Teller Reconciliation Summary</h2>
        <table>
          <thead><tr><th>Teller</th><th style="text-align:center">Reconciled</th><th style="text-align:right">Closing Balance</th><th style="text-align:right">Variance</th></tr></thead>
          <tbody>${tellerRows}</tbody>
        </table>` : ''}

        <div class="footer">
          <span>This is an official branch EOD report. Keep for records.</span>
          <span>Andy D Enterprise &mdash; Branch EOD</span>
        </div>
        <script>window.print();<\/script>
      </body>
      </html>
    `);
    win.document.close();
  };

  // Teller variance summary for check result
  const tellerVarianceSummary = checkResult?.tellerStatus
    ? {
        submitted: checkResult.tellerStatus.filter((t: EodCheckTellerStatus) => t.hasSubmitted).length,
        resolved: checkResult.tellerStatus.filter((t: EodCheckTellerStatus) => t.isResolved).length,
        total: checkResult.tellerStatus.length,
        totalVariance: checkResult.tellerStatus.reduce((sum: number, t: EodCheckTellerStatus) => sum + (t.reconciliation ? Math.abs(Number(t.reconciliation.variance)) : 0), 0),
        hasOverageOrShortage: checkResult.tellerStatus.some((t: EodCheckTellerStatus) => t.reconciliation && Number(t.reconciliation.variance) !== 0),
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Branch End of Day</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Close a receiving branch after every teller is either balanced or supervisor-approved.
          </p>
        </div>
      </div>

      {/* Server Date Banner */}
      {selectedBranchId && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                {selectedBranch?.name ?? 'Branch'} — Current Business Date
              </p>
              {serverDateLoading ? (
                <div className="h-5 w-28 bg-emerald-100 rounded animate-pulse mt-0.5" />
              ) : (
                <p className="text-base font-bold text-emerald-900">
                  {serverDate
                    ? new Date(serverDate + 'T12:00:00').toLocaleDateString('en-GH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })
                    : '—'}
                </p>
              )}
            </div>
          </div>
          {canManageDate && selectedBranchId && (
            <button
              onClick={() => { setManualDateOpen(true); setManualDateInput(serverDate ?? date); setManualDateError(''); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-xl hover:bg-emerald-50 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Adjust Date
            </button>
          )}
        </div>
      )}

      {/* Close form */}
      <Card>
        <CardContent>
          <h2 className="text-base font-bold text-gray-800 mb-4">Close Branch Day</h2>

          <div className="flex items-end gap-3 mb-4 flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  const bid = e.target.value;
                  setSelectedBranchId(bid);
                  setCheckResult(null);
                  setCheckError('');
                  setCloseError('');
                  setCloseSuccess('');
                  setForceClose(false);
                  setServerDate(null);
                  void loadServerDate(bid);
                }}
                disabled={isBranchLocked}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm min-w-64 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">Select branch...</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setCheckResult(null); setCloseError(''); setCloseSuccess(''); }}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <Button variant="secondary" onClick={runCheck} isLoading={checkLoading}>
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Check Status
            </Button>
          </div>

          {checkError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{checkError}</div>
          )}

          {checkResult && (
            <div className="space-y-4">
              {checkResult.alreadyClosed ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-emerald-800 font-medium">
                    {selectedBranch?.name ?? 'This branch'} is already closed for {new Date(checkResult.date + 'T00:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 font-medium">Tellers Submitted</p>
                      <p className={`text-xl font-bold mt-0.5 ${checkResult.allSubmitted ? 'text-emerald-700' : 'text-amber-600'}`}>
                        {tellerVarianceSummary?.submitted} / {tellerVarianceSummary?.total}
                      </p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 font-medium">Resolved Recons</p>
                      <p className={`text-xl font-bold mt-0.5 ${checkResult.allResolved ? 'text-emerald-700' : 'text-amber-600'}`}>
                        {tellerVarianceSummary?.resolved} / {tellerVarianceSummary?.total}
                      </p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 font-medium">Today&apos;s Disbursements</p>
                      <p className="text-xl font-bold mt-0.5 text-gray-900">GHS {fmt(checkResult.totalDisbursedToday)}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 font-medium">Total Variance</p>
                      <p className={`text-xl font-bold mt-0.5 ${!tellerVarianceSummary?.hasOverageOrShortage ? 'text-emerald-700' : 'text-red-600'}`}>
                        GHS {fmt(tellerVarianceSummary?.totalVariance ?? 0)}
                      </p>
                    </div>
                  </div>

                  {/* Outstanding payable to receivers */}
                  {(checkResult as EodCheckResult & { pendingPayableGHS?: number }).pendingPayableGHS !== undefined && (
                    <div className={`flex items-start gap-3 p-4 rounded-xl border ${
                      (checkResult as EodCheckResult & { pendingPayableGHS?: number }).pendingPayableGHS! > 0
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-emerald-50 border-emerald-200'
                    }`}>
                      <svg className={`w-5 h-5 shrink-0 mt-0.5 ${
                        (checkResult as EodCheckResult & { pendingPayableGHS?: number }).pendingPayableGHS! > 0
                          ? 'text-blue-500' : 'text-emerald-500'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className={`text-sm font-bold ${
                          (checkResult as EodCheckResult & { pendingPayableGHS?: number }).pendingPayableGHS! > 0
                            ? 'text-blue-800' : 'text-emerald-800'
                        }`}>
                          Outstanding payable to receivers: GHS {fmt((checkResult as EodCheckResult & { pendingPayableGHS?: number }).pendingPayableGHS ?? 0)}
                        </p>
                        <p className={`text-xs mt-0.5 ${
                          (checkResult as EodCheckResult & { pendingPayableGHS?: number }).pendingPayableGHS! > 0
                            ? 'text-blue-700' : 'text-emerald-700'
                        }`}>
                          {(checkResult as EodCheckResult & { pendingPayableGHS?: number }).pendingPayableGHS! > 0
                            ? 'This is the total GHS the branch owes to receivers. It reduces as tellers make payments.'
                            : 'All payables cleared — no outstanding obligations to receivers.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Teller status table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Teller Status</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50/50">
                          <th className="text-left py-2.5 px-4 text-gray-600 font-semibold">Teller</th>
                          <th className="text-left py-2.5 px-4 text-gray-600 font-semibold">Reconciliation</th>
                          <th className="text-right py-2.5 px-4 text-gray-600 font-semibold">Till Balance</th>
                          <th className="text-right py-2.5 px-4 text-gray-600 font-semibold">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {checkResult.tellerStatus.map((t: EodCheckTellerStatus) => (
                          <tr key={t.tellerId} className="hover:bg-gray-50">
                            <td className="py-2.5 px-4 font-semibold text-gray-900">{t.tellerName}</td>
                            <td className="py-2.5 px-4">
                              {!t.reconciliation ? (
                                <StatusPill tone="neutral" label="Missing" />
                              ) : t.isRejected ? (
                                <StatusPill tone="danger" label="Rejected" />
                              ) : t.requiresSupervisorReview ? (
                                <StatusPill tone="warning" label="Pending Review" />
                              ) : (
                                <StatusPill
                                  tone="success"
                                  label={t.reconciliation.status === 'COMPLETED' ? 'Completed' : 'Approved'}
                                />
                              )}
                            </td>
                            <td className={`py-2.5 px-4 text-right font-semibold tabular-nums ${t.tillBalance > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                              GHS {fmt(t.tillBalance)}
                            </td>
                            <td className={`py-2.5 px-4 text-right font-semibold tabular-nums ${
                              !t.reconciliation ? 'text-gray-300' :
                              Number(t.reconciliation.variance) === 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {t.reconciliation
                                ? (Number(t.reconciliation.variance) > 0 ? '+' : '') + fmt(Number(t.reconciliation.variance))
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Warning: unreconciled tellers */}
                  {!checkResult.allSubmitted && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-bold text-amber-800">
                        {checkResult.unreconciledCount} teller(s) have not submitted reconciliation.
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        You can force-close only when there are no pending or rejected discrepancy reviews.
                      </p>
                      <label className="flex items-center gap-2 mt-3 text-sm text-amber-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={forceClose}
                          onChange={(e) => setForceClose(e.target.checked)}
                          disabled={!checkResult.canForceClose}
                          className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="font-medium">Force close anyway</span>
                      </label>
                    </div>
                  )}

                  {checkResult.pendingApprovalCount > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm font-bold text-red-800">
                        {checkResult.pendingApprovalCount} reconciliation(s) still require supervisor approval.
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        Branch EOD cannot close until every discrepancy is approved.
                      </p>
                    </div>
                  )}

                  {checkResult.rejectedCount > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm font-bold text-red-800">
                        {checkResult.rejectedCount} reconciliation(s) were rejected.
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        The affected tellers must resubmit before branch EOD can close.
                      </p>
                    </div>
                  )}

                  {/* Blocker: tills with funds */}
                  {!checkResult.tillsCleared && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-bold text-amber-800">
                        {checkResult.pendingTills.length} teller till{checkResult.pendingTills.length !== 1 ? 's' : ''} still have a non-zero balance.
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Tellers should return cash to the vault. If a transfer request is already submitted and awaiting approval, approve it first — or force-close to override.
                      </p>
                      <ul className="mt-2 space-y-0.5">
                        {checkResult.pendingTills.map((t: EodCheckTellerStatus) => (
                          <li key={t.tellerId} className="text-xs text-amber-800 font-medium flex items-center justify-between">
                            <span>{t.tellerName}</span>
                            <span className="font-bold tabular-nums">GHS {fmt(t.tillBalance)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">EOD Notes (optional)</label>
                    <textarea
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      rows={2}
                      placeholder="Any branch notes for this day..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  {closeError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{closeError}</div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={handleClose}
                      isLoading={closing}
                      disabled={!checkResult.canClose && !(forceClose && checkResult.canForceClose)}
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Close Branch Day
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {closeSuccess && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-emerald-800 font-medium">{closeSuccess}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardContent>
          <h2 className="text-base font-bold text-gray-800 mb-4">EOD History</h2>
          {histLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Date</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Total Disbursed</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Transactions</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Closed By</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Closed At</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {new Date(r.date).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700 tabular-nums">
                        GHS {fmt(r.totalDisbursed)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600 tabular-nums">{r.disbursementCount}</td>
                      <td className="py-3 px-4 text-gray-700">
                        {r.closedBy?.firstName} {r.closedBy?.lastName}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs font-mono">
                        {new Date(r.closedAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleExportPdf(r)}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-medium"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          PDF Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">No EOD records yet</p>
              <p className="text-xs text-gray-400 mt-1">Complete your first branch close using the form above.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Manual Server Date Modal ─── */}
      {manualDateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Adjust Branch Server Date</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedBranch?.name ?? 'Selected branch'}</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Business Date</label>
                <input
                  type="date"
                  value={manualDateInput}
                  onChange={(e) => setManualDateInput(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                This sets the business date for this branch. It is normally advanced automatically when you close the branch day. Use this to correct the date if needed.
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
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2">
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
