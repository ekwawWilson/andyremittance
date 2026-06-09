'use client';
import { useEffect, useState, useMemo } from 'react';
import { apiClient, Transaction } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';

function fmtGHS(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_STYLES: Record<string, string> = {
  PAID:            'bg-emerald-100 text-emerald-800',
  PARTIAL_PAYMENT: 'bg-amber-100 text-amber-800',
  VOID:            'bg-red-100 text-red-800',
  FLAGGED:         'bg-orange-100 text-orange-800',
  SYNCED:          'bg-blue-100 text-blue-800',
  CANCELLED:       'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  PAID:            'Paid',
  PARTIAL_PAYMENT: 'Partial',
  VOID:            'Void',
  FLAGGED:         'Flagged',
  SYNCED:          'Pending',
  CANCELLED:       'Cancelled',
};

const MODE_STYLES: Record<string, string> = {
  CASH: 'bg-emerald-100 text-emerald-800',
  BANK: 'bg-blue-100 text-blue-800',
  MOMO: 'bg-purple-100 text-purple-800',
};

const inputCls =
  'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none';

interface KPI {
  label: string;
  count: number;
  total: number;
  color: string;
}

export default function DailyTransactionReportPage() {
  const { user } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('PAID,PARTIAL_PAYMENT,VOID,FLAGGED,SYNCED');
  const [codeTypeFilter, setCodeTypeFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const load = () => {
    if (!user) return;
    setIsLoading(true);
    setFetchError('');
    apiClient
      .getTransactions({
        receivingPointId: user.receivingPoint?.id,
        status: statusFilter || undefined,
        codeType: codeTypeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate
          ? endDate + 'T23:59:59'
          : undefined,
        limit: 500,
      })
      .then((res) => {
        if (res.success && res.data) {
          let txs: Transaction[] = res.data.transactions ?? [];
          // Apply mode filter client-side (API doesn't have a receivingMode filter param)
          if (modeFilter) txs = txs.filter((t) => t.receivingMode === modeFilter);
          setTransactions(txs);
        } else {
          setFetchError(res.error || 'Failed to load transactions');
        }
        setIsLoading(false);
      });
  };

  useEffect(() => {
    if (user) load();
  }, [user, startDate, endDate, statusFilter, codeTypeFilter, modeFilter]);

  // KPI aggregation
  const kpis = useMemo<KPI[]>(() => {
    const paid   = transactions.filter((t) => t.status === 'PAID');
    const partial = transactions.filter((t) => t.status === 'PARTIAL_PAYMENT');
    const pending = transactions.filter((t) => t.status === 'SYNCED');
    const voided  = transactions.filter((t) => t.status === 'VOID' || t.status === 'FLAGGED');
    const sum = (arr: Transaction[]) => arr.reduce((s, t) => s + Number(t.ghsAmount), 0);
    return [
      { label: 'Paid',    count: paid.length,    total: sum(paid),    color: 'text-emerald-700' },
      { label: 'Partial', count: partial.length,  total: sum(partial), color: 'text-amber-700'   },
      { label: 'Pending', count: pending.length,  total: sum(pending), color: 'text-blue-700'    },
      { label: 'Void / Flagged', count: voided.length, total: sum(voided), color: 'text-red-700' },
    ];
  }, [transactions]);

  const totalGHS = useMemo(() => transactions.reduce((s, t) => s + Number(t.ghsAmount), 0), [transactions]);

  const exportCSV = () => {
    const header = ['Code', 'Type', 'Status', 'Sender', 'Receiver', 'Mode', 'GHS Amount', 'Date'];
    const rows = transactions.map((t) => [
      t.transactionCode,
      t.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard',
      STATUS_LABELS[t.status] ?? t.status,
      `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.trim(),
      `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim(),
      t.receivingMode,
      Number(t.ghsAmount).toFixed(2),
      new Date(t.transactionDate ?? t.createdAt).toLocaleDateString('en-CA'),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-report-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const branchName = user?.receivingPoint?.name ?? 'Branch';
    const rows = transactions
      .map(
        (t) =>
          `<tr>
            <td>${t.transactionCode}</td>
            <td>${t.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard'}</td>
            <td>${STATUS_LABELS[t.status] ?? t.status}</td>
            <td>${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}</td>
            <td>${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}</td>
            <td>${t.receivingMode}</td>
            <td style="text-align:right">GHS ${Number(t.ghsAmount).toFixed(2)}</td>
            <td>${new Date(t.transactionDate ?? t.createdAt).toLocaleDateString('en-CA')}</td>
          </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Transaction Report</title>
<style>
  body { font-family: sans-serif; font-size: 11px; margin: 20px; }
  h2 { margin: 0 0 4px; }
  p  { margin: 0 0 12px; color: #555; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
  tfoot td { font-weight: bold; border-top: 2px solid #d1d5db; }
  @media print { @page { size: A4 landscape; margin: 12mm; } }
</style></head><body>
<h2>Transaction Report — ${branchName}</h2>
<p>Period: ${startDate} to ${endDate} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</p>
<table>
  <thead><tr><th>Code</th><th>Type</th><th>Status</th><th>Sender</th><th>Receiver</th><th>Mode</th><th>GHS Amount</th><th>Date</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="6">Total (${transactions.length} transactions)</td>
    <td style="text-align:right">GHS ${fmtGHS(totalGHS)}</td>
    <td></td>
  </tr></tfoot>
</table>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Daily Transaction Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} &nbsp;·&nbsp; GHS {fmtGHS(totalGHS)} total
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
          <button
            onClick={exportPDF}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.count}</p>
              <p className="text-xs text-gray-500 mt-0.5">GHS {fmtGHS(k.total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls + ' w-full'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls + ' w-full'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={codeTypeFilter}
              onChange={(e) => setCodeTypeFilter(e.target.value)}
              className={inputCls + ' w-full bg-white'}
            >
              <option value="">All Types</option>
              <option value="STANDARD">Standard</option>
              <option value="ADDITIONAL">Immediate</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mode</label>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className={inputCls + ' w-full bg-white'}
            >
              <option value="">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="MOMO">MoMo</option>
            </select>
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          {[
            { value: 'PAID,PARTIAL_PAYMENT,VOID,FLAGGED,SYNCED', label: 'All' },
            { value: 'PAID',            label: 'Paid' },
            { value: 'PARTIAL_PAYMENT', label: 'Partial' },
            { value: 'SYNCED',          label: 'Pending' },
            { value: 'VOID',            label: 'Void' },
            { value: 'FLAGGED',         label: 'Flagged' },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {fetchError && (
          <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-200">{fetchError}</div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No transactions found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Code</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Sender</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Receiver</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Mode</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">GHS Amount</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-gray-800">{t.transactionCode}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.codeType === 'ADDITIONAL' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                        {t.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{t.sender?.firstName} {t.sender?.lastName}</td>
                    <td className="py-3 px-4 text-gray-600">{t.receiver?.firstName} {t.receiver?.lastName}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MODE_STYLES[t.receivingMode] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.receivingMode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      GHS {fmtGHS(Number(t.ghsAmount))}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {fmtDate(t.transactionDate ?? t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={6} className="py-3 px-4 text-xs font-semibold text-gray-600">
                    Total — {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700">
                    GHS {fmtGHS(totalGHS)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
