'use client';
import { useEffect, useState } from 'react';
import { apiClient, ChartOfAccountsResult, AccountingAccount } from '@/lib/api-client';

const GROUP_LABELS: Record<string, string> = {
  '1000': 'Assets — Cash & Equivalents (CAD)',
  '2000': 'Assets — Cash & Equivalents (GHS)',
  '3000': 'Receivables',
  '4000': 'Payables',
  '5000': 'Equity',
  '6000': 'Income',
  '7000': 'Disbursement Expenses',
  '7400': 'Operational Expenses',
  'OTHER': 'Other / Unclassified',
};

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

export default function ChartOfAccountsPage() {
  const [data,    setData]    = useState<ChartOfAccountsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [currency, setCurrency] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await apiClient.getChartOfAccounts({ currency: currency || undefined, includeInactive: true });
    if (res.success && res.data) setData(res.data);
    else setError(res.error ?? 'Failed');
    setLoading(false);
  };

  useEffect(() => { load(); }, [currency]);

  const filtered = data?.accounts.filter((a) => {
    const q = search.toLowerCase();
    return !q || a.accountCode.toLowerCase().includes(q) || a.accountName.toLowerCase().includes(q) || (a.accountNumber ?? '').includes(q);
  });

  const groups = data?.grouped.map((g) => ({
    ...g,
    accounts: g.accounts.filter((a) => {
      const q = search.toLowerCase();
      return !q || a.accountCode.toLowerCase().includes(q) || a.accountName.toLowerCase().includes(q);
    }),
  })).filter((g) => g.accounts.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-gray-400 mt-0.5">{data?.totalAccounts ?? 0} accounts · full ledger hierarchy</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none">
            <option value="">All Currencies</option>
            <option value="CAD">CAD</option>
            <option value="GHS">GHS</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <input type="text" placeholder="Search by account name, code, or number…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      ) : (
        <div className="space-y-4">
          {groups?.map((group) => (
            <div key={group.groupCode} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50/80 border-b border-gray-100">
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-2">{group.groupCode}</span>
                  <span className="text-sm font-semibold text-gray-700">{GROUP_LABELS[group.groupCode] ?? group.groupLabel}</span>
                </div>
                <div className="text-xs text-gray-400">{group.accounts.length} accounts</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-20">No.</th>
                    <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</th>
                    <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Account Name</th>
                    <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                    <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ccy</th>
                    <th className="text-right py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance</th>
                    <th className="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Branch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {group.accounts.map((acct) => (
                    <tr key={acct.id} className={`hover:bg-gray-50/60 transition-colors ${!acct.isActive ? 'opacity-40' : ''}`}>
                      <td className="py-3 px-4 text-xs text-gray-400 font-mono">{acct.accountNumber ?? '—'}</td>
                      <td className="py-3 px-4 font-mono text-xs text-blue-600 font-bold">{acct.accountCode}</td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-800 text-sm">{acct.accountName}</p>
                        {acct.description && <p className="text-xs text-gray-400 mt-0.5">{acct.description}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${TYPE_COLORS[acct.accountType] ?? 'bg-gray-100 text-gray-600'}`}>
                          {acct.accountType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-gray-500">{acct.currency}</td>
                      <td className={`py-3 px-4 text-right font-bold text-sm ${acct.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                        {acct.currency === 'GHS' ? 'GHS ' : 'CAD '}{Number(acct.balance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400">{acct.receivingPoint?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50/60 border-t border-gray-100">
                    <td colSpan={5} className="py-2 px-4 text-xs font-semibold text-gray-500 uppercase">Group Total</td>
                    <td className="py-2 px-4 text-right font-bold text-sm text-violet-700">
                      {group.totalBalance.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
