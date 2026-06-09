'use client';
import { useEffect, useState } from 'react';
import { apiClient, ConsolidatedReport } from '@/lib/api-client';
import { fmtNum } from '@/lib/utils/format';

export default function ConsolidatedReportPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 7) + '-01';
  const [from,   setFrom]   = useState(firstOfMonth);
  const [to,     setTo]     = useState(today);
  const [rateOverride, setRateOverride] = useState('');
  const [data,   setData]   = useState<ConsolidatedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const params: { from: string; to: string; exchangeRate?: number } = { from, to };
    if (rateOverride && !isNaN(Number(rateOverride))) params.exchangeRate = Number(rateOverride);
    const res = await apiClient.getConsolidatedReport(params);
    if (res.success && res.data) setData(res.data);
    else setError(res.error ?? 'Failed to load consolidated report');
    setLoading(false);
  };

  useEffect(() => { load(); }, [from, to]);

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
  const fmtCAD = (n: number) => `CAD ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
  const fmtGHS = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Consolidated Report</h1>
        <p className="text-sm text-gray-400 mt-0.5">Company-wide view across all branches and the sending side</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">Exchange Rate Override (CAD/GHS)</label>
            <input
              type="number"
              step="0.0001"
              placeholder="Leave blank to use latest"
              value={rateOverride}
              onChange={(e) => setRateOverride(e.target.value)}
              className={`${inputCls} w-52`}
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      {loading && !data ? (
        <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : data ? (
        <>
          {/* Consolidated KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Paid Transactions',   value: data.consolidated.paidTransactions.toLocaleString(),                          sub: 'across all branches',        color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100' },
              { label: 'Total CAD Sent',       value: fmtCAD(data.consolidated.totalCAD),                                           sub: 'sending side',               color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
              { label: 'GHS Vault Total',      value: fmtGHS(data.consolidated.totalGHSVaults),                                     sub: `≈ ${fmtCAD(data.consolidated.totalGHSCADEquiv)}`,  color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Net CAD Position',     value: fmtCAD(data.consolidated.netCADPosition),                                     sub: 'cash + GHS equiv',           color: data.consolidated.netCADPosition >= 0 ? 'text-green-700' : 'text-red-700', bg: data.consolidated.netCADPosition >= 0 ? 'bg-green-50' : 'bg-red-50', border: data.consolidated.netCADPosition >= 0 ? 'border-green-100' : 'border-red-100' },
            ].map((kpi) => (
              <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4`}>
                <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Exchange rate note */}
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl">
            <span className="text-amber-600 text-xs font-bold">Rate</span>
            <p className="text-xs text-amber-700">
              Reporting exchange rate: <strong>1 CAD = {data.reportingExchangeRate.toFixed(4)} GHS</strong>
              {' '}· GHS→CAD: <strong>÷ {data.reportingExchangeRate.toFixed(4)}</strong>
            </p>
          </div>

          {/* Sending side */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Sending Side (CAD)</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Company Cash',    value: data.sendingSide.companyCashCAD },
                { label: 'Total Income',    value: data.sendingSide.totalIncomeCAD },
                { label: 'Total Receivable', value: data.sendingSide.totalReceivableCAD },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 font-medium">{item.label}</p>
                  <p className="text-base font-bold text-gray-800 mt-0.5">{fmtCAD(item.value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Branch table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-700">Branch Breakdown ({data.branches.length} branches)</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Branch</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Vault (GHS)</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Vault (CAD Equiv)</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Paid Txns</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pending</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">GHS Disbursed</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Variance</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Recons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.branches.map((b) => (
                  <tr key={b.branchId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-gray-800">{b.branchName}</p>
                      <p className="text-xs text-gray-400">{b.branchCode} · {b.city}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-700">
                      {b.vaultBalance.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-gray-500">
                      {b.vaultCADEquiv.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-green-600">{b.transactions.paidCount}</td>
                    <td className="py-3 px-4 text-right text-amber-600">{b.transactions.pendingCount + b.transactions.syncedCount}</td>
                    <td className="py-3 px-4 text-right text-xs text-gray-600">
                      {b.transactions.paidGHS.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-3 px-4 text-right text-xs font-bold ${b.reconciliation.totalVariance < 0 ? 'text-red-600' : b.reconciliation.totalVariance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {b.reconciliation.totalVariance !== 0
                        ? fmtNum(b.reconciliation.totalVariance)
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-gray-500">{b.reconciliation.reconCount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50/80 border-t-2 border-gray-200">
                  <td className="py-3 px-4 text-xs font-bold text-gray-600 uppercase">Totals</td>
                  <td className="py-3 px-4 text-right font-bold text-sm text-emerald-700">
                    {data.consolidated.totalGHSVaults.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-sm text-gray-700">
                    {data.consolidated.totalGHSCADEquiv.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-sm text-green-700">{data.consolidated.paidTransactions}</td>
                  <td />
                  <td className="py-3 px-4 text-right font-bold text-sm text-gray-700">
                    {data.consolidated.totalGHS.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`py-3 px-4 text-right font-bold text-sm ${data.consolidated.totalVariance < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtNum(data.consolidated.totalVariance)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
