'use client';
import { useEffect, useState } from 'react';
import { apiClient, IncomeStatement } from '@/lib/api-client';

export default function IncomeSummaryPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 7) + '-01';
  const [from,    setFrom]    = useState(firstOfMonth);
  const [to,      setTo]      = useState(today);
  const [data,    setData]    = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await apiClient.getIncomeStatement({ from, to, currency: 'CAD' });
    if (res.success && res.data) setData(res.data);
    else setError(res.error ?? 'Failed to load income summary');
    setLoading(false);
  };

  useEffect(() => { load(); }, [from, to]);

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
  const fmtCAD = (n: number) => `CAD ${Math.abs(n).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Income Summary</h1>
        <p className="text-sm text-gray-400 mt-0.5">CAD revenue and fee income for the sending side</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3 flex-wrap items-center">
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
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      ) : data ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Revenue',    value: fmtCAD(data.income.total),   color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-100' },
              { label: 'Total Expenses',   value: fmtCAD(data.expenses.total), color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-100' },
              { label: 'Net Income (CAD)', value: fmtCAD(data.netIncome),      color: data.netIncome >= 0 ? 'text-violet-700' : 'text-red-700', bg: 'bg-violet-50', border: 'border-violet-100' },
            ].map((kpi) => (
              <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4`}>
                <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Transaction stats */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Transaction Volume</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Transactions</p>
                <p className="text-lg font-bold text-blue-700 mt-0.5">{data.transactionCount.toLocaleString()}</p>
              </div>
              <div className="bg-violet-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Total CAD Sent</p>
                <p className="text-lg font-bold text-violet-700 mt-0.5">{fmtCAD(data.totalCAD)}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Total GHS Equivalent</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">
                  GHS {data.totalGHS.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-green-50/60 border-b border-green-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-green-700">Revenue Breakdown</h3>
              <span className="text-sm font-bold text-green-700">{fmtCAD(data.income.total)}</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {data.income.rows.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-8 text-gray-400">No revenue entries in period</td></tr>
                ) : (
                  data.income.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-blue-600 font-bold w-32">{row.accountCode}</td>
                      <td className="py-3 px-4 font-medium text-gray-800">{row.accountName}</td>
                      <td className="py-3 px-4 text-right font-bold text-green-700">{fmtCAD(row.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.income.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50/60 border-t border-gray-100">
                    <td colSpan={2} className="py-2 px-4 text-xs font-semibold text-gray-500 uppercase">Total Revenue</td>
                    <td className="py-2 px-4 text-right font-bold text-sm text-green-700">{fmtCAD(data.income.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Net income footer */}
          <div className={`rounded-2xl border p-5 flex items-center justify-between ${data.netIncome >= 0 ? 'bg-violet-50 border-violet-100' : 'bg-red-50 border-red-100'}`}>
            <div>
              <p className="text-sm font-semibold text-gray-600">Net Income (CAD)</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(data.period.from).toLocaleDateString('en-GH')} – {new Date(data.period.to).toLocaleDateString('en-GH')}
              </p>
            </div>
            <p className={`text-3xl font-bold ${data.netIncome >= 0 ? 'text-violet-700' : 'text-red-700'}`}>
              {data.netIncome < 0 ? '(' : ''}{fmtCAD(data.netIncome)}{data.netIncome < 0 ? ')' : ''}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
