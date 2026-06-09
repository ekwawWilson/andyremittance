'use client';
import { useEffect, useState, useMemo } from 'react';
import { apiClient, Transaction, SubPayment } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingServerDate } from '@/lib/hooks/useReceivingServerDate';
import { printReceipt } from '@/lib/print-receipt';

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n: number) { return fmt(n); }

function ModeBadge({ mode }: { mode: string }) {
  const map: Record<string, string> = {
    CASH: 'bg-emerald-100 text-emerald-800',
    BANK: 'bg-blue-100 text-blue-800',
    MOMO: 'bg-purple-100 text-purple-800',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${map[mode] ?? 'bg-gray-100 text-gray-700'}`}>
      {mode}
    </span>
  );
}

function SummaryCard({ label, value, sub, color = 'text-gray-900' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function DisbursementsPage() {
  const { user } = useAuth();
  const { serverDate, loading: serverDateLoading } = useReceivingServerDate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Initialise date filters once server date loads
  useEffect(() => {
    if (serverDateLoading || dateFrom) return;
    setDateFrom(serverDate);
    setDateTo(serverDate);
  }, [serverDate, serverDateLoading]);

  // Filters
  const [tellerFilter, setTellerFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [codeTypeFilter, setCodeTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const fetchDisbursements = () => {
    setIsLoading(true);
    apiClient.getTransactions({
      status: 'PAID,PARTIAL_PAYMENT',
      receivingPointId: user?.receivingPoint?.id,
      startDate: dateFrom || undefined,
      endDate: dateTo || undefined,
      limit: 500,
    }).then((res) => {
      if (res.success && res.data) setTransactions(res.data.transactions);
      setIsLoading(false);
    });
  };

  useEffect(() => {
    if (user) fetchDisbursements();
  }, [user, dateFrom, dateTo]);

  // Teller list for filter
  const tellerNames = useMemo(() => {
    const names = new Set(transactions.map((t) => t.paidByName).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [transactions]);

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (tellerFilter && t.paidByName !== tellerFilter) return false;
      if (modeFilter && t.receivingMode !== modeFilter) return false;
      if (codeTypeFilter && t.codeType !== codeTypeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const senderName = `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.toLowerCase();
        const receiverName = `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.toLowerCase();
        const code = (t.transactionCode ?? '').toLowerCase();
        if (!senderName.includes(q) && !receiverName.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, tellerFilter, modeFilter, codeTypeFilter, searchQuery]);

  // For partial-payment transactions, the disbursed amount is the sum of sub-payments,
  // not the full ghsAmount. For PAID transactions with sub-payments use sub-payment totals too.
  const disbursedAmount = (t: Transaction): number => {
    const subs = t.subPayments;
    if (subs && subs.length > 0) return subs.reduce((s, sp) => s + Number(sp.ghsAmount), 0);
    return Number(t.ghsAmount);
  };

  // Summary stats
  const totalGHS = filtered.reduce((sum, t) => sum + disbursedAmount(t), 0);
  const byMode = filtered.reduce((acc, t) => {
    acc[t.receivingMode] = (acc[t.receivingMode] ?? 0) + disbursedAmount(t);
    return acc;
  }, {} as Record<string, number>);
  const partialCount = filtered.filter((t) => t.status === 'PARTIAL_PAYMENT').length;

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Code', 'Sender', 'Receiver', 'GHS Amount', 'Mode', 'Paid By', 'Paid At'];
    const rows = filtered.map((t) => [
      t.transactionCode,
      `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.trim(),
      `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim(),
      fmt(Number(t.ghsAmount)),
      t.receivingMode,
      t.paidByName || '',
      t.paidAt ? new Date(t.paidAt).toLocaleString('en-GH') : '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disbursements-${dateFrom}${dateTo !== dateFrom ? `-to-${dateTo}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export PDF
  const handleExportPdf = () => {
    const rows = filtered.map((t) => `
      <tr>
        <td class="mono">${t.transactionCode}</td>
        <td>${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}</td>
        <td>${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}</td>
        <td style="text-align:right">GHS ${fmt(Number(t.ghsAmount))}</td>
        <td>${t.receivingMode}</td>
        <td>${t.paidByName || '—'}</td>
        <td>${t.paidAt ? new Date(t.paidAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      </tr>`).join('');

    const modeBreakdownRows = Object.entries(byMode).map(([mode, amount]) =>
      `<div class="mode-item"><span>${mode}</span><strong>GHS ${fmt(amount)}</strong></div>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><title>Disbursements</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 2px; }
        .meta { color: #555; font-size: 11px; margin-bottom: 16px; }
        .summary { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .summary-item label { color: #166534; font-size: 10px; text-transform: uppercase; display: block; }
        .summary-item span { font-size: 15px; font-weight: 700; color: #14532d; }
        .mode-breakdown { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .mode-item { background: #f3f4f6; border-radius: 6px; padding: 8px 12px; font-size: 11px; }
        .mode-item span { color: #666; display: block; margin-bottom: 2px; }
        .mode-item strong { font-size: 13px; color: #111; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
        td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
        .mono { font-family: monospace; }
        .total-row td { background: #f0fdf4; font-weight: bold; border-top: 2px solid #d1fae5; }
        @media print { body { margin: 16px; } }
      </style></head><body>
      <h1>Disbursements Report</h1>
      <p class="meta">
        Branch: <strong>${user?.receivingPoint?.name || '—'}</strong> &nbsp;|&nbsp;
        Period: <strong>${dateFrom}${dateTo !== dateFrom ? ' to ' + dateTo : ''}</strong> &nbsp;|&nbsp;
        Generated: ${new Date().toLocaleString('en-GH')}
        ${tellerFilter ? ` &nbsp;|&nbsp; Teller: <strong>${tellerFilter}</strong>` : ''}
        ${modeFilter ? ` &nbsp;|&nbsp; Mode: <strong>${modeFilter}</strong>` : ''}
      </p>
      <div class="summary">
        <div class="summary-item"><label>Total Disbursed</label><span>GHS ${fmt(totalGHS)}</span></div>
        <div class="summary-item"><label>Transactions</label><span>${filtered.length}</span></div>
        <div class="summary-item"><label>Average</label><span>GHS ${filtered.length > 0 ? fmt(totalGHS / filtered.length) : '0.00'}</span></div>
      </div>
      ${modeBreakdownRows ? `<div class="mode-breakdown">${modeBreakdownRows}</div>` : ''}
      <table><thead><tr>
        <th>Code</th><th>Sender</th><th>Receiver</th><th style="text-align:right">GHS</th><th>Mode</th><th>Teller</th><th>Paid At</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="3">Total</td>
          <td style="text-align:right">GHS ${fmt(totalGHS)}</td>
          <td colspan="3">${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}</td>
        </tr>
      </tbody></table>
      <script>window.print();<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const hasActiveFilter = tellerFilter || modeFilter || codeTypeFilter || searchQuery;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Disbursements</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-sm text-gray-500">Paid-out transaction history for this branch</p>
            {!serverDateLoading && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700">
                <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(serverDate + 'T12:00:00').toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSV
          </button>
          <Button variant="secondary" onClick={handleExportPdf} disabled={filtered.length === 0}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3">
            {/* Search — full width on mobile */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, sender, receiver…"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            {/* Dropdowns + dates — wrap on mobile */}
            <div className="flex flex-wrap gap-2 items-center">
              <select value={tellerFilter} onChange={(e) => setTellerFilter(e.target.value)}
                className="flex-1 min-w-28 px-2.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                <option value="">All tellers</option>
                {tellerNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}
                className="flex-1 min-w-28 px-2.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                <option value="">All modes</option>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="MOMO">Mobile Money</option>
              </select>
              <select value={codeTypeFilter} onChange={(e) => setCodeTypeFilter(e.target.value)}
                className="flex-1 min-w-28 px-2.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                <option value="">All types</option>
                <option value="STANDARD">Standard</option>
                <option value="ADDITIONAL">Additional</option>
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {(hasActiveFilter || dateFrom !== serverDate || dateTo !== serverDate) && (
                <button onClick={() => { setDateFrom(serverDate); setDateTo(serverDate); setTellerFilter(''); setModeFilter(''); setCodeTypeFilter(''); setSearchQuery(''); }}
                  className="text-xs text-gray-500 hover:text-red-600 underline whitespace-nowrap">
                  Reset all
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Disbursed"
          value={`GHS ${fmt(totalGHS)}`}
          color="text-emerald-600"
          sub={`${filtered.length} tx${partialCount > 0 ? ` · ${partialCount} partial` : ''}`}
        />
        <SummaryCard
          label="Cash"
          value={byMode['CASH'] ? `GHS ${fmt(byMode['CASH'])}` : '—'}
          color="text-emerald-700"
        />
        <SummaryCard
          label="Bank Transfer"
          value={byMode['BANK'] ? `GHS ${fmt(byMode['BANK'])}` : '—'}
          color="text-blue-700"
        />
        <SummaryCard
          label="Mobile Money"
          value={byMode['MOMO'] ? `GHS ${fmt(byMode['MOMO'])}` : '—'}
          color="text-violet-700"
        />
      </div>

      {/* Transactions list */}
      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : filtered.length > 0 ? (
            <>
              {/* ── Mobile card list (hidden sm+) ──────────────────────────── */}
              <div className="sm:hidden divide-y divide-gray-100 -mx-4">
                {filtered.map((t) => {
                  const isPartial = t.status === 'PARTIAL_PAYMENT';
                  const disbursed = disbursedAmount(t);
                  const total = Number(t.ghsAmount);
                  const remaining = total - disbursed;
                  const subs = t.subPayments ?? [];
                  const isOpen = expanded.has(t.id);
                  return (
                    <div key={t.id} className={`px-4 py-3.5 ${isPartial ? 'bg-amber-50/40' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-mono font-bold text-blue-600 text-xs">{t.transactionCode}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPartial && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">PARTIAL</span>}
                          <ModeBadge mode={t.receivingMode} />
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {t.sender?.firstName} {t.sender?.lastName}
                        <span className="text-gray-300 mx-1">→</span>
                        {t.receiver?.firstName || t.receiver?.lastName ? `${t.receiver!.firstName} ${t.receiver!.lastName}` : '—'}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <div>
                          <span className="font-bold text-emerald-700">GHS {fmt(disbursed)}</span>
                          {isPartial && <span className="ml-2 text-xs text-amber-600">Rem: {fmt(remaining)}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {t.paidAt ? new Date(t.paidAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' }) : isPartial ? 'In progress' : '—'}
                          </span>
                          {t.receivingMode === 'CASH' && !isPartial && (
                            <button onClick={() => printReceipt(t, user?.receivingPoint?.name ?? 'Branch')}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                          )}
                          {subs.length > 0 && (
                            <button onClick={() => toggleExpand(t.id)}
                              className="text-xs text-amber-600 underline font-medium">
                              {isOpen ? 'Hide' : `${subs.length} partial${subs.length > 1 ? 's' : ''}`}
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Mobile partials expand */}
                      {subs.length > 0 && isOpen && (
                        <div className="mt-3 border border-amber-200 rounded-xl overflow-hidden">
                          {(subs as SubPayment[]).map((sp, idx) => (
                            <div key={sp.id} className={`px-3 py-2 text-xs ${idx > 0 ? 'border-t border-amber-100' : ''} bg-amber-50/60`}>
                              <div className="flex justify-between">
                                <span className="font-semibold text-gray-700">{sp.receiverName || '—'}</span>
                                <span className="font-bold text-emerald-700">GHS {fmt(Number(sp.ghsAmount))}</span>
                              </div>
                              <span className="text-gray-400">{sp.paidByName} · {new Date(sp.paidAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Mobile footer total */}
                <div className="px-4 py-3 bg-emerald-50 flex justify-between text-sm">
                  <span className="font-bold text-emerald-800">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-emerald-800">GHS {fmt(totalGHS)}</span>
                </div>
              </div>

              {/* ── Desktop table (hidden below sm) ───────────────────────── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="py-3 px-2 w-8"></th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">Code</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">Sender</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">Receiver</th>
                      <th className="text-right py-3 px-4 text-gray-600 font-semibold">Disbursed</th>
                      <th className="text-right py-3 px-4 text-gray-600 font-semibold">Total</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">Mode</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">Teller</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">Paid At</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const subs = t.subPayments ?? [];
                      const hasPartials = subs.length > 0;
                      const isPartial = t.status === 'PARTIAL_PAYMENT';
                      const isOpen = expanded.has(t.id);
                      const disbursed = disbursedAmount(t);
                      const total = Number(t.ghsAmount);
                      const remaining = total - disbursed;
                      return (
                        <>
                          <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isPartial ? 'bg-amber-50/40' : ''}`}>
                            <td className="py-3 px-2 text-center">
                              {hasPartials ? (
                                <button onClick={() => toggleExpand(t.id)}
                                  className="p-1 rounded text-gray-400 hover:text-gray-700 transition-colors">
                                  <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              ) : null}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-blue-600 font-semibold">{t.transactionCode}</span>
                                {isPartial && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">PARTIAL</span>}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-700">{t.sender?.firstName} {t.sender?.lastName}</td>
                            <td className="py-3 px-4 text-gray-700">
                              {t.receiver?.firstName || t.receiver?.lastName ? `${t.receiver!.firstName} ${t.receiver!.lastName}` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700 tabular-nums">GHS {fmt(disbursed)}</td>
                            <td className="py-3 px-4 text-right tabular-nums">
                              {isPartial ? (
                                <div>
                                  <span className="text-gray-500 text-xs">GHS {fmt(total)}</span>
                                  <p className="text-[10px] text-amber-600 font-medium">Rem: {fmt(remaining)}</p>
                                </div>
                              ) : <span className="text-gray-400 text-xs">GHS {fmt(total)}</span>}
                            </td>
                            <td className="py-3 px-4"><ModeBadge mode={t.receivingMode} /></td>
                            <td className="py-3 px-4 text-gray-600 text-xs">{t.paidByName || '—'}</td>
                            <td className="py-3 px-4 text-gray-500 text-xs font-mono">
                              {t.paidAt ? new Date(t.paidAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : isPartial ? <span className="text-amber-500">In progress</span> : '—'}
                            </td>
                            <td className="py-3 px-4">
                              {t.receivingMode === 'CASH' && !isPartial ? (
                                <button onClick={() => printReceipt(t, user?.receivingPoint?.name ?? 'Branch')} title="Print receipt"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                  </svg>
                                </button>
                              ) : null}
                            </td>
                          </tr>
                          {hasPartials && isOpen && (
                            <tr key={`${t.id}-subs`} className="bg-amber-50/60 border-b border-amber-100">
                              <td colSpan={10} className="px-6 py-0">
                                <div className="py-3">
                                  <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-2">Partial Payments ({subs.length})</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-amber-200">
                                        <th className="text-left py-1.5 pr-4 text-gray-500 font-semibold">#</th>
                                        <th className="text-left py-1.5 pr-4 text-gray-500 font-semibold">Receiver</th>
                                        <th className="text-right py-1.5 pr-4 text-gray-500 font-semibold">Amount</th>
                                        <th className="text-left py-1.5 pr-4 text-gray-500 font-semibold">Mode</th>
                                        <th className="text-left py-1.5 pr-4 text-gray-500 font-semibold">Teller</th>
                                        <th className="text-left py-1.5 pr-4 text-gray-500 font-semibold">Paid At</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-100">
                                      {(subs as SubPayment[]).map((sp, idx) => (
                                        <tr key={sp.id} className="hover:bg-amber-100/40 transition-colors">
                                          <td className="py-1.5 pr-4 text-gray-400">{idx + 1}</td>
                                          <td className="py-1.5 pr-4 text-gray-700 font-medium">
                                            {sp.receiverName || '—'}
                                            {sp.receiverPhone && <span className="text-gray-400 ml-1">· {sp.receiverPhone}</span>}
                                          </td>
                                          <td className="py-1.5 pr-4 text-right font-bold text-emerald-700 tabular-nums">GHS {fmt(Number(sp.ghsAmount))}</td>
                                          <td className="py-1.5 pr-4">{sp.receivingMode ? <ModeBadge mode={sp.receivingMode} /> : '—'}</td>
                                          <td className="py-1.5 pr-4 text-gray-600">{sp.paidByName || '—'}</td>
                                          <td className="py-1.5 pr-4 text-gray-500 font-mono">
                                            {new Date(sp.paidAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-amber-200">
                                        <td colSpan={2} className="py-1.5 pr-4 font-semibold text-gray-600">Total paid so far</td>
                                        <td className="py-1.5 pr-4 text-right font-bold text-emerald-700 tabular-nums">GHS {fmt(disbursed)}</td>
                                        <td colSpan={3} />
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-emerald-200 bg-emerald-50">
                      <td colSpan={4} className="py-3 px-4 text-sm font-bold text-emerald-800">
                        Total ({filtered.length} transaction{filtered.length !== 1 ? 's' : ''}{partialCount > 0 ? `, ${partialCount} partial` : ''})
                      </td>
                      <td className="py-3 px-4 text-right text-base font-bold text-emerald-800 tabular-nums">GHS {fmt(totalGHS)}</td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">
                {hasActiveFilter ? 'No disbursements match the active filters' : 'No disbursements for this period'}
              </p>
              {hasActiveFilter && (
                <button onClick={() => { setTellerFilter(''); setModeFilter(''); setSearchQuery(''); }}
                  className="mt-2 text-xs text-emerald-600 hover:text-emerald-800 underline">
                  Clear filters
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
