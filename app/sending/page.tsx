'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiClient, DashboardStats, ExchangeRate } from '@/lib/api-client';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Link from 'next/link';

function fmt(n: number | string) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SendingDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rateWarning, setRateWarning] = useState<string | null>(null);

  const loadDashboard = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    setLoadError(null);
    try {
      const [statsRes, rateRes] = await Promise.all([
        apiClient.getDashboardStats(),
        apiClient.getTodayRate(),
      ]);
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      } else if (!statsRes.success) {
        setLoadError('Failed to load dashboard statistics.');
      }
      if (!rateRes.success) {
        setRateWarning('No exchange rate set for today. Contact admin before processing transactions.');
      } else if (rateRes.data && (rateRes.data as ExchangeRate & { isLatest?: boolean }).isLatest) {
        const d = new Date((rateRes.data as ExchangeRate).date);
        setRateWarning(`No rate for today — using ${d.toLocaleDateString('en-CA')} rate (${Number((rateRes.data as ExchangeRate).cadToGhs).toFixed(4)} GHS/CAD).`);
      } else {
        setRateWarning(null);
      }
    } catch {
      setLoadError('Unexpected error. Please refresh.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  const today = stats?.today;
  const txs = stats?.recentTransactions ?? [];

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDashboard(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <Link
            href="/sending/transactions/new"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Transaction
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {loadError && (
        <div className="flex items-center justify-between px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span>{loadError}</span>
          <button onClick={() => loadDashboard(true)} className="text-xs font-medium underline ml-4">Retry</button>
        </div>
      )}
      {rateWarning && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          {rateWarning}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Txns today', value: today?.count ?? 0, sub: null },
          { label: 'CAD collected', value: `$${fmt(today?.totalCAD ?? 0)}`, sub: null },
          { label: 'GHS sent', value: `GHS ${fmt(today?.totalGHS ?? 0)}`, sub: null },
          { label: 'All-time txns', value: stats?.summary?.totalTransactions ?? 0, sub: `$${fmt(stats?.summary?.totalCAD ?? 0)} total` },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-xl font-semibold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Status + breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Today by status</p>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Pending',   value: today?.pending ?? 0,   color: 'text-amber-600' },
                { label: 'Synced',    value: today?.synced ?? 0,    color: 'text-blue-600'  },
                { label: 'Paid',      value: today?.paid ?? 0,      color: 'text-green-600' },
                { label: 'Cancelled', value: today?.cancelled ?? 0, color: 'text-red-500'   },
              ].map(({ label, value, color }) => (
                <tr key={label} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-600">{label}</td>
                  <td className={`py-2 text-right font-semibold ${color}`}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">By type</p>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Standard',  txs: txs.filter(t => t.codeType === 'STANDARD')  },
                { label: 'Immediate', txs: txs.filter(t => t.codeType === 'ADDITIONAL') },
              ].map(({ label, txs: rows }) => (
                <tr key={label} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-600">{label}</td>
                  <td className="py-2 text-right font-semibold text-gray-800">{rows.length}</td>
                  <td className="py-2 text-right text-gray-400 text-xs">${fmt(rows.reduce((a, t) => a + Number(t.cadAmount), 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">By payment method</p>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Cash',       txs: txs.filter(t => t.paymentMethod === 'CASH')       },
                { label: 'E-Transfer', txs: txs.filter(t => t.paymentMethod === 'E_TRANSFER')  },
                { label: 'Split',      txs: txs.filter(t => t.paymentMethod === 'SPLIT')       },
              ].map(({ label, txs: rows }) => (
                <tr key={label} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-600">{label}</td>
                  <td className="py-2 text-right font-semibold text-gray-800">{rows.length}</td>
                  <td className="py-2 text-right text-gray-400 text-xs">${fmt(rows.reduce((a, t) => a + Number(t.cadAmount), 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-800">Recent Transactions</p>
          <Link href="/sending/transactions" className="text-xs text-blue-600 hover:underline">View all</Link>
        </div>

        {txs.length ? (
          <>
            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-50">
              {txs.map((t) => (
                <Link key={t.id} href={`/sending/transactions/${t.id}`}
                  className={`block px-5 py-3 hover:bg-gray-50 transition-colors ${t.status === 'CANCELLED' ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-xs text-blue-600 font-medium">{t.transactionCode}</span>
                    <TransactionStatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate mr-2">
                      {t.sender?.firstName} {t.sender?.lastName}
                      <span className="text-gray-300 mx-1">→</span>
                      {t.receiver?.firstName} {t.receiver?.lastName}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 shrink-0">${fmt(t.cadAmount)}</span>
                  </div>
                </Link>
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left py-2.5 px-5 text-xs font-medium text-gray-400">Code</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-400">Sender → Receiver</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-400">CAD</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-400">GHS</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-400">Payment</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {txs.map((t) => (
                    <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${t.status === 'CANCELLED' ? 'opacity-40' : ''}`}>
                      <td className="py-3 px-5">
                        <Link href={`/sending/transactions/${t.id}`} className="font-mono text-xs text-blue-600 hover:underline font-medium">
                          {t.transactionCode}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        <span className="font-medium">{t.sender?.firstName} {t.sender?.lastName}</span>
                        <span className="text-gray-300 mx-1.5">→</span>
                        <span className="text-gray-500">{t.receiver?.firstName} {t.receiver?.lastName}</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-800">${fmt(t.cadAmount)}</td>
                      <td className="py-3 px-4 text-gray-400 text-xs">GHS {fmt(t.ghsAmount)}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{t.paymentMethod?.replace('_', '-')}</td>
                      <td className="py-3 px-4"><TransactionStatusBadge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No transactions today</p>
            <Link href="/sending/transactions/new" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
              Create first transaction
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
