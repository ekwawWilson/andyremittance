'use client';
import { useEffect, useState } from 'react';
import { apiClient, BranchAccountingSummary, ReceivingPoint } from '@/lib/api-client';

export default function AdminBranchSummaryPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 7) + '-01';

  const [branches,   setBranches]   = useState<ReceivingPoint[]>([]);
  const [branchId,   setBranchId]   = useState<string>('');
  const [from,       setFrom]       = useState(firstOfMonth);
  const [to,         setTo]         = useState(today);
  const [data,       setData]       = useState<BranchAccountingSummary | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    apiClient.getReceivingPoints().then((res) => {
      if (res.success && res.data) {
        setBranches(res.data);
        if (res.data.length > 0) setBranchId(res.data[0].id);
      }
    });
  }, []);

  const load = async () => {
    if (!branchId) { setError('Select a branch'); return; }
    setLoading(true);
    setError('');
    const res = await apiClient.getBranchAccountingSummary({ receivingPointId: branchId, from, to });
    if (res.success && res.data) setData(res.data);
    else { setError(res.error ?? 'Failed to load branch summary'); setData(null); }
    setLoading(false);
  };

  useEffect(() => {
    if (branchId) load();
  }, [branchId, from, to]);

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
  const fmtGHS = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Branch Accounting Summary</h1>
        <p className="text-sm text-gray-400 mt-0.5">Per-branch vault, tellers, disbursements, reconciliation and expense breakdown</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${inputCls} w-56`}>
            <option value="">Select Branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : data ? (
        <>
          {/* Branch header + vault */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{data.branch.name}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{data.branch.code} · {data.branch.city}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(data.period.from).toLocaleDateString('en-GH')} — {new Date(data.period.to).toLocaleDateString('en-GH')}
                </p>
              </div>
              {data.vault && (
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Vault Balance</p>
                  <p className={`text-2xl font-bold ${data.vault.balance < 1000 ? 'text-red-600' : data.vault.balance < 5000 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {fmtGHS(data.vault.balance)}
                  </p>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">{data.vault.accountCode}</p>
                </div>
              )}
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Disbursements',    value: data.disbursements.count.toString(),  sub: fmtGHS(data.disbursements.totalGHS),  color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100' },
              { label: 'Till Float Total', value: fmtGHS(data.totalTillBalance),        sub: `${data.tellers.length} tellers`,     color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
              { label: 'Total Expenses',   value: fmtGHS(data.totalExpenses),           sub: `${data.expenses.length} accounts`,   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-100' },
              { label: 'Variance (Net)',   value: fmtGHS(data.reconciliation.totalVariance), sub: `${data.reconciliation.completed + data.reconciliation.approved} resolved`, color: Math.abs(data.reconciliation.totalVariance) < 0.01 ? 'text-green-700' : 'text-amber-700', bg: Math.abs(data.reconciliation.totalVariance) < 0.01 ? 'bg-green-50' : 'bg-amber-50', border: Math.abs(data.reconciliation.totalVariance) < 0.01 ? 'border-green-100' : 'border-amber-100' },
            ].map((kpi) => (
              <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4`}>
                <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tellers */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-violet-50/60 border-b border-violet-100">
                <h3 className="text-sm font-bold text-violet-700">Teller Till Balances</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Teller</th>
                    <th className="text-right py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.tellers.length === 0 ? (
                    <tr><td colSpan={2} className="text-center py-6 text-gray-400 text-sm">No tellers found</td></tr>
                  ) : (
                    data.tellers.map((t) => (
                      <tr key={t.tellerId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 font-medium text-gray-800">{t.tellerName}</td>
                        <td className={`py-3 px-4 text-right font-bold text-sm ${t.tillBalance < 200 ? 'text-red-600' : t.tillBalance < 500 ? 'text-amber-600' : 'text-emerald-700'}`}>
                          {fmtGHS(t.tillBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50/60 border-t border-gray-100">
                    <td className="py-2 px-4 text-xs font-semibold text-gray-500 uppercase">Total Float</td>
                    <td className="py-2 px-4 text-right font-bold text-sm text-violet-700">{fmtGHS(data.totalTillBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Reconciliation */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Reconciliation Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Completed', count: data.reconciliation.completed, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                  { label: 'Approved', count: data.reconciliation.approved, color: 'text-green-700', bg: 'bg-green-50' },
                  { label: 'Pending',  count: data.reconciliation.pending,  color: 'text-amber-700', bg: 'bg-amber-50' },
                  { label: 'Rejected', count: data.reconciliation.rejected, color: 'text-red-700',   bg: 'bg-red-50'   },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.count}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Net Variance',   value: data.reconciliation.totalVariance,  color: Math.abs(data.reconciliation.totalVariance) < 0.01 ? 'text-green-700' : 'text-amber-700' },
                  { label: 'Total Shortage', value: data.reconciliation.shortageAmount, color: 'text-red-600' },
                  { label: 'Total Excess',   value: data.reconciliation.excessAmount,   color: 'text-green-600' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{row.label}</span>
                    <span className={`text-sm font-bold ${row.color}`}>{fmtGHS(row.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Expenses */}
          {data.expenses.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-red-50/60 border-b border-red-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-red-700">Expenses (GHS)</h3>
                <span className="text-sm font-bold text-red-700">{fmtGHS(data.totalExpenses)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {data.expenses.map((exp) => (
                    <tr key={exp.accountCode} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-blue-600 font-bold w-36">{exp.accountCode}</td>
                      <td className="py-3 px-4 font-medium text-gray-800">{exp.accountName}</td>
                      <td className="py-3 px-4 text-right font-bold text-red-600">{fmtGHS(exp.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50/60 border-t border-gray-100">
                    <td colSpan={2} className="py-2 px-4 text-xs font-semibold text-gray-500 uppercase">Total</td>
                    <td className="py-2 px-4 text-right font-bold text-sm text-red-700">{fmtGHS(data.totalExpenses)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
