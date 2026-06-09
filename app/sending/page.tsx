'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiClient, DashboardStats, ExchangeRate } from '@/lib/api-client';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Link from 'next/link';

function fmt(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className={`relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-8 translate-x-8 ${accent}`} />
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent} bg-opacity-10`}>
          {icon}
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      {sub && <p className="mt-1.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function BreakdownRow({ label, count, amount, dot }: { label: string; count: number; amount: number; dot: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-800">{count}</span>
        <span className="text-xs text-gray-400 ml-2">${fmt(amount)}</span>
      </div>
    </div>
  );
}

export default function SendingDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rateWarning, setRateWarning] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

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
        setLastRefreshed(new Date());
      } else if (!statsRes.success) {
        setLoadError('Failed to load dashboard statistics. Check your connection and try again.');
      }
      if (!rateRes.success) {
        setRateWarning('No exchange rate is set for today. Contact admin before processing transactions.');
      } else if (rateRes.data && (rateRes.data as ExchangeRate & { isLatest?: boolean }).isLatest) {
        const d = new Date((rateRes.data as ExchangeRate).date);
        setRateWarning(`No rate set for today. Using rate from ${d.toLocaleDateString('en-CA')} (${Number((rateRes.data as ExchangeRate).cadToGhs).toFixed(4)} CAD/GHS). Contact admin to set today's rate.`);
      } else {
        setRateWarning(null);
      }
    } catch {
      setLoadError('Unexpected error loading dashboard. Please refresh.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
        <p className="text-sm text-gray-400">Loading dashboard…</p>
      </div>
    </div>
  );

  const today = stats?.today;
  const txs = stats?.recentTransactions ?? [];
  const standard = txs.filter((t) => t.codeType === 'STANDARD');
  const immediate = txs.filter((t) => t.codeType === 'ADDITIONAL');
  const byCash = txs.filter((t) => t.paymentMethod === 'CASH');
  const byEtransfer = txs.filter((t) => t.paymentMethod === 'E_TRANSFER');
  const bySplit = txs.filter((t) => t.paymentMethod === 'SPLIT');

  const dateStr = new Date().toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
          {lastRefreshed && (
            <p className="text-xs text-gray-300 mt-0.5">
              Updated {lastRefreshed.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadDashboard(true)}
            disabled={isRefreshing}
            title="Refresh stats"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 shadow-sm transition-all disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <Link
            href="/sending/transactions/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 shadow-sm hover:shadow-md transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">New Transaction</span>
            <span className="sm:hidden">New Txn</span>
          </Link>
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">Dashboard Error</p>
            <p className="text-sm text-red-700 mt-0.5">{loadError}</p>
          </div>
          <button onClick={() => loadDashboard(true)} className="text-xs font-medium text-red-700 hover:text-red-800 underline shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Exchange rate warning */}
      {rateWarning && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">Exchange Rate Warning</p>
            <p className="text-sm text-amber-700 mt-0.5">{rateWarning}</p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Transactions Today"
          value={today?.count ?? 0}
          icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
          accent="bg-blue-500"
        />
        <StatCard
          label="CAD Collected"
          value={<span className="text-green-600">${fmt(today?.totalCAD ?? 0)}</span>}
          icon={<svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          accent="bg-green-500"
        />
        <StatCard
          label="GHS Sent"
          value={<span className="text-purple-600">GHS {fmt(today?.totalGHS ?? 0)}</span>}
          icon={<svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
          accent="bg-purple-500"
        />
        <StatCard
          label="All-Time Total"
          value={<span className="text-gray-700">{stats?.summary?.totalTransactions ?? 0}</span>}
          sub={`$${fmt(stats?.summary?.totalCAD ?? 0)} CAD`}
          icon={<svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          accent="bg-gray-400"
        />
      </div>

      {/* Status + breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Status breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">By Status</p>
          <div className="divide-y divide-gray-50">
            {[
              { label: 'Pending', value: today?.pending ?? 0, color: 'text-amber-600', dot: 'bg-amber-400' },
              { label: 'Synced', value: today?.synced ?? 0, color: 'text-blue-600', dot: 'bg-blue-400' },
              { label: 'Paid', value: today?.paid ?? 0, color: 'text-green-600', dot: 'bg-green-400' },
              { label: 'Cancelled', value: today?.cancelled ?? 0, color: 'text-red-500', dot: 'bg-red-400' },
            ].map(({ label, value, color, dot }) => (
              <div key={label} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-sm text-gray-600">{label}</span>
                </div>
                <span className={`text-sm font-bold ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Type breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">By Type</p>
          <div className="divide-y divide-gray-50">
            <BreakdownRow
              label="Standard"
              count={standard.length}
              amount={standard.reduce((a, t) => a + Number(t.cadAmount), 0)}
              dot="bg-gray-400"
            />
            <BreakdownRow
              label="Immediate"
              count={immediate.length}
              amount={immediate.reduce((a, t) => a + Number(t.cadAmount), 0)}
              dot="bg-orange-400"
            />
          </div>
        </div>

        {/* Payment method */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">By Payment</p>
          <div className="divide-y divide-gray-50">
            <BreakdownRow label="Cash" count={byCash.length} amount={byCash.reduce((a, t) => a + Number(t.cadAmount), 0)} dot="bg-green-400" />
            <BreakdownRow label="E-Transfer" count={byEtransfer.length} amount={byEtransfer.reduce((a, t) => a + Number(t.cadAmount), 0)} dot="bg-blue-400" />
            <BreakdownRow label="Split" count={bySplit.length} amount={bySplit.reduce((a, t) => a + Number(t.cadAmount), 0)} dot="bg-amber-400" />
          </div>
        </div>
      </div>

      {/* Recent Transactions table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Recent Transactions</h2>
            <p className="text-xs text-gray-400 mt-0.5">{txs.length} transaction{txs.length !== 1 ? 's' : ''} today</p>
          </div>
          <Link href="/sending/transactions" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors">
            View all
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {txs.length ? (
          <>
            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-50">
              {txs.map((t) => (
                <Link key={t.id} href={`/sending/transactions/${t.id}`} className={`block px-4 py-3 hover:bg-blue-50/30 transition-colors ${t.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono font-semibold text-blue-600 text-xs">{t.transactionCode}</span>
                    <TransactionStatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-gray-700 truncate">
                      <span className="font-medium">{t.sender?.firstName} {t.sender?.lastName}</span>
                      <span className="text-gray-300 mx-1">→</span>
                      <span className="text-gray-500">{t.receiver?.firstName} {t.receiver?.lastName}</span>
                    </p>
                    <p className="text-sm font-semibold text-gray-800 shrink-0">${fmt(t.cadAmount)}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">GHS {fmt(t.ghsAmount)}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400">{t.paymentMethod?.replace('_', '-')}</span>
                    {t.codeType === 'ADDITIONAL' && <span className="text-xs font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">Immediate</span>}
                    {t.syncedToReceiving && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">Synced</span>}
                  </div>
                </Link>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/60 border-b border-gray-100">
                    <th className="text-left py-3 px-6 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sender → Receiver</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">CAD</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">GHS</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payment</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status / Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {txs.map((t) => (
                    <tr key={t.id} className={`hover:bg-blue-50/30 transition-colors ${t.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                      <td className="py-3.5 px-6">
                        <Link href={`/sending/transactions/${t.id}`} className="font-mono font-semibold text-blue-600 hover:text-blue-700 text-xs">
                          {t.transactionCode}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-gray-800">{t.sender?.firstName} {t.sender?.lastName}</span>
                        <span className="text-gray-300 mx-1.5">→</span>
                        <span className="text-gray-600">{t.receiver?.firstName} {t.receiver?.lastName}</span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-800">${fmt(t.cadAmount)}</td>
                      <td className="py-3.5 px-4 text-gray-500 text-xs">GHS {fmt(t.ghsAmount)}</td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{t.paymentMethod?.replace('_', '-')}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.codeType === 'ADDITIONAL' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <TransactionStatusBadge status={t.status} />
                          {t.syncedToReceiving && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 w-fit">Synced</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No transactions today</p>
            <p className="text-gray-400 text-sm mt-1">Start by creating a new transaction</p>
            <Link href="/sending/transactions/new" className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create first transaction
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
