'use client';
import { useEffect, useState } from 'react';
import { apiClient, IncomeStatement } from '@/lib/api-client';

export default function IncomeStatementPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 7) + '-01';
  const [from,     setFrom]     = useState(firstOfMonth);
  const [to,       setTo]       = useState(today);
  const [currency, setCurrency] = useState('CAD');
  const [data,     setData]     = useState<IncomeStatement | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await apiClient.getIncomeStatement({ from, to, currency: currency || undefined });
    if (res.success && res.data) setData(res.data);
    else setError(res.error ?? 'Failed to load income statement');
    setLoading(false);
  };

  useEffect(() => { load(); }, [from, to, currency]);

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
  const fmt = (n: number, ccy: string) =>
    `${ccy} ${Math.abs(n).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Income Statement</h1>
        <p className="text-sm text-gray-400 mt-0.5">Profit & Loss for the selected period</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">From</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); }} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">To</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); }} className={inputCls} />
          </div>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
            <option value="CAD">CAD</option>
            <option value="GHS">GHS</option>
          </select>
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
          {/* KPI summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Income',   value: data.income.total,   color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
              { label: 'Total Expenses', value: data.expenses.total, color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-100' },
              { label: 'Net Income',     value: data.netIncome,      color: data.netIncome >= 0 ? 'text-violet-700' : 'text-red-700', bg: 'bg-violet-50', border: 'border-violet-100' },
              { label: 'Transactions',   value: null,                color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
            ].map((kpi) => (
              <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4`}>
                <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                {kpi.value !== null ? (
                  <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{fmt(kpi.value, data.currency)}</p>
                ) : (
                  <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{data.transactionCount.toLocaleString()}</p>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-green-50/60 border-b border-green-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-green-700 uppercase tracking-wide">Revenue</h3>
                <span className="text-sm font-bold text-green-700">{fmt(data.income.total, data.currency)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {data.income.rows.length === 0 ? (
                    <tr><td colSpan={2} className="text-center py-8 text-gray-400 text-sm">No income entries</td></tr>
                  ) : (
                    data.income.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-800">{row.accountName}</p>
                          <p className="text-xs text-gray-400 font-mono">{row.accountCode}</p>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-green-700">{fmt(row.amount, data.currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Expenses */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-red-50/60 border-b border-red-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-red-700 uppercase tracking-wide">Expenses</h3>
                <span className="text-sm font-bold text-red-700">{fmt(data.expenses.total, data.currency)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {data.expenses.rows.length === 0 ? (
                    <tr><td colSpan={2} className="text-center py-8 text-gray-400 text-sm">No expense entries</td></tr>
                  ) : (
                    data.expenses.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-800">{row.accountName}</p>
                          <p className="text-xs text-gray-400 font-mono">{row.accountCode}</p>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-red-600">{fmt(row.amount, data.currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Net income footer */}
          <div className={`rounded-2xl border p-5 flex items-center justify-between ${data.netIncome >= 0 ? 'bg-violet-50 border-violet-100' : 'bg-red-50 border-red-100'}`}>
            <div>
              <p className="text-sm font-semibold text-gray-600">Net Income (Period)</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(data.period.from).toLocaleDateString('en-GH')} — {new Date(data.period.to).toLocaleDateString('en-GH')}
              </p>
            </div>
            <p className={`text-3xl font-bold ${data.netIncome >= 0 ? 'text-violet-700' : 'text-red-700'}`}>
              {data.netIncome < 0 ? '(' : ''}{fmt(data.netIncome, data.currency)}{data.netIncome < 0 ? ')' : ''}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
