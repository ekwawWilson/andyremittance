'use client';
import { useEffect, useState } from 'react';
import { apiClient, BalanceSheet, AccountingAccount } from '@/lib/api-client';
import { fmtNum } from '@/lib/utils/format';

function Section({ title, rows, totalCAD, totalGHS, color }: {
  title: string;
  rows: AccountingAccount[];
  totalCAD: number;
  totalGHS: number;
  color: 'blue' | 'rose' | 'amber';
}) {
  const headerColors = {
    blue:  'bg-blue-50/60 border-blue-100 text-blue-700',
    rose:  'bg-rose-50/60 border-rose-100 text-rose-700',
    amber: 'bg-amber-50/60 border-amber-100 text-amber-700',
  };
  const totalColors = {
    blue:  'text-blue-700',
    rose:  'text-rose-700',
    amber: 'text-amber-700',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`px-5 py-3 border-b ${headerColors[color]} flex items-center justify-between`}>
        <h3 className={`text-sm font-bold uppercase tracking-wide ${totalColors[color]}`}>{title}</h3>
        <div className="flex gap-4 text-xs font-bold">
          <span className={totalColors[color]}>CAD {totalCAD.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
          <span className="text-gray-400">|</span>
          <span className={totalColors[color]}>GHS {totalGHS.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-50">
            <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</th>
            <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Account</th>
            <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ccy</th>
            <th className="text-right py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance</th>
            <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Branch</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-sm">No accounts</td></tr>
          ) : (
            rows.map((acct) => (
              <tr key={acct.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="py-3 px-4 font-mono text-xs font-bold text-blue-600">{acct.accountCode}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-gray-800">{acct.accountName}</p>
                  {acct.description && <p className="text-xs text-gray-400">{acct.description}</p>}
                </td>
                <td className="py-3 px-4 text-xs font-semibold text-gray-500">{acct.currency}</td>
                <td className={`py-3 px-4 text-right font-bold text-sm ${acct.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                  {acct.currency === 'GHS' ? 'GHS ' : 'CAD '}
                  {Number(acct.balance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-xs text-gray-400">{acct.receivingPoint?.name ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function BalanceSheetPage() {
  const today = new Date().toISOString().split('T')[0];
  const [asOf,    setAsOf]    = useState(today);
  const [data,    setData]    = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await apiClient.getBalanceSheet({ asOf });
    if (res.success && res.data) setData(res.data);
    else setError(res.error ?? 'Failed to load balance sheet');
    setLoading(false);
  };

  useEffect(() => { load(); }, [asOf]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Balance Sheet</h1>
          <p className="text-sm text-gray-400 mt-0.5">Statement of financial position as of date</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 font-medium whitespace-nowrap">As Of</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          />
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
          {/* Balance check banners */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['CAD', 'GHS'] as const).map((ccy) => {
              const s = data.summary[ccy];
              const balanced = Math.abs(s.check) < 0.01;
              return (
                <div key={ccy} className={`rounded-2xl border p-4 flex items-center justify-between ${balanced ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                  <div>
                    <p className={`text-sm font-bold ${balanced ? 'text-green-700' : 'text-red-700'}`}>
                      {ccy} — {balanced ? 'Balanced' : 'OUT OF BALANCE'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Assets {fmtNum(s.totalAssets)} · Liabilities + Equity {fmtNum(s.totalLiabilities + s.totalEquity)}
                    </p>
                  </div>
                  <span className={`w-3 h-3 rounded-full ${balanced ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
              );
            })}
          </div>

          {/* Sections */}
          <Section title="Assets"      rows={data.assets.rows}      totalCAD={data.assets.totalCAD}      totalGHS={data.assets.totalGHS}      color="blue"  />
          <Section title="Liabilities" rows={data.liabilities.rows} totalCAD={data.liabilities.totalCAD} totalGHS={data.liabilities.totalGHS} color="rose"  />
          <Section title="Equity"      rows={data.equity.rows}      totalCAD={data.equity.totalCAD}      totalGHS={data.equity.totalGHS}      color="amber" />

          {/* Retained net income */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Retained Net Income (P&L accounts)</h3>
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-gray-400 font-medium">CAD Net Income</p>
                <p className={`text-lg font-bold ${data.retainedNetIncome.CAD >= 0 ? 'text-violet-700' : 'text-red-600'}`}>
                  CAD {data.retainedNetIncome.CAD.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">GHS Net Income</p>
                <p className={`text-lg font-bold ${data.retainedNetIncome.GHS >= 0 ? 'text-violet-700' : 'text-red-600'}`}>
                  GHS {data.retainedNetIncome.GHS.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Summary totals */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">Summary</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Category</th>
                  <th className="text-right py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">CAD</th>
                  <th className="text-right py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">GHS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { label: 'Total Assets',             cad: data.summary.CAD.totalAssets,      ghs: data.summary.GHS.totalAssets      },
                  { label: 'Total Liabilities',        cad: data.summary.CAD.totalLiabilities, ghs: data.summary.GHS.totalLiabilities },
                  { label: 'Total Equity',             cad: data.summary.CAD.totalEquity,       ghs: data.summary.GHS.totalEquity      },
                  { label: 'Balance Check (A−L−E)',    cad: data.summary.CAD.check,             ghs: data.summary.GHS.check            },
                ].map((row) => (
                  <tr key={row.label} className={`hover:bg-gray-50/60 ${row.label.startsWith('Balance') ? 'bg-gray-50/60 font-bold' : ''}`}>
                    <td className="py-3 px-4 text-sm text-gray-700">{row.label}</td>
                    <td className={`py-3 px-4 text-right text-sm font-bold ${row.label.startsWith('Balance') && Math.abs(row.cad) > 0.01 ? 'text-red-600' : 'text-gray-800'}`}>
                      {row.cad.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-3 px-4 text-right text-sm font-bold ${row.label.startsWith('Balance') && Math.abs(row.ghs) > 0.01 ? 'text-red-600' : 'text-gray-800'}`}>
                      {row.ghs.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
