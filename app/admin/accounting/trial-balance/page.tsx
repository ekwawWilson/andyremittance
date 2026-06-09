'use client';
import { useEffect, useState } from 'react';
import { apiClient, TrialBalance } from '@/lib/api-client';
import { fmtNum } from '@/lib/utils/format';

const TYPE_COLORS: Record<string, string> = {
  COMPANY_CASH:  'bg-blue-100 text-blue-700',
  COMPANY_VAULT: 'bg-emerald-100 text-emerald-700',
  TELLER_TILL:   'bg-teal-100 text-teal-700',
  SENDER:        'bg-violet-100 text-violet-700',
  INCOME:        'bg-green-100 text-green-700',
  EXPENSE:       'bg-red-100 text-red-700',
  EQUITY:        'bg-amber-100 text-amber-700',
  RECEIVABLE:    'bg-indigo-100 text-indigo-700',
  BANK_CLEARING: 'bg-sky-100 text-sky-700',
  MOMO_CLEARING: 'bg-purple-100 text-purple-700',
  LIABILITY:     'bg-rose-100 text-rose-700',
};

export default function TrialBalancePage() {
  const today = new Date().toISOString().split('T')[0];
  const [asOf,     setAsOf]     = useState(today);
  const [currency, setCurrency] = useState('');
  const [data,     setData]     = useState<TrialBalance | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await apiClient.getTrialBalance({ asOf, currency: currency || undefined });
    if (res.success && res.data) setData(res.data);
    else setError(res.error ?? 'Failed to load trial balance');
    setLoading(false);
  };

  useEffect(() => { load(); }, [asOf, currency]);

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Trial Balance</h1>
          <p className="text-sm text-gray-400 mt-0.5">All accounts with debit / credit totals and net balance</p>
        </div>
        {data && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${data.isBalanced ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <span className={`w-2 h-2 rounded-full ${data.isBalanced ? 'bg-green-500' : 'bg-red-500'}`} />
            {data.isBalanced ? 'Balanced' : 'OUT OF BALANCE'}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">As Of</label>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputCls} />
          </div>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
            <option value="">All Currencies</option>
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Account Name</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ccy</th>
                <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Debits</th>
                <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Credits</th>
                <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Net Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.map((row) => (
                <tr key={row.id} className={`hover:bg-gray-50/60 transition-colors ${!row.isActive ? 'opacity-40' : ''}`}>
                  <td className="py-3 px-4 font-mono text-xs font-bold text-blue-600">{row.accountCode}</td>
                  <td className="py-3 px-4 text-sm text-gray-800 font-medium">{row.accountName}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${TYPE_COLORS[row.accountType] ?? 'bg-gray-100 text-gray-600'}`}>
                      {row.accountType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold text-gray-500">{row.currency}</td>
                  <td className="py-3 px-4 text-right text-xs font-bold text-gray-700">
                    {row.totalDebits > 0 ? fmtNum(row.totalDebits) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-bold text-gray-700">
                    {row.totalCredits > 0 ? fmtNum(row.totalCredits) : '—'}
                  </td>
                  <td className={`py-3 px-4 text-right font-bold text-sm ${row.netBalance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {fmtNum(row.netBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50/80 border-t-2 border-gray-200">
                <td colSpan={4} className="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">Grand Totals</td>
                <td className="py-3 px-4 text-right font-bold text-sm text-blue-700">{fmtNum(data.grandTotalDebits)}</td>
                <td className="py-3 px-4 text-right font-bold text-sm text-green-700">{fmtNum(data.grandTotalCredits)}</td>
                <td className={`py-3 px-4 text-right font-bold text-sm ${data.isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                  {fmtNum(data.grandTotalDebits - data.grandTotalCredits)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
