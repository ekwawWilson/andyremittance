'use client';
import { useEffect, useState } from 'react';
import { apiClient, DashboardStats } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingServerDate } from '@/lib/hooks/useReceivingServerDate';
import Link from 'next/link';

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceivingDashboard() {
  const { user } = useAuth();
  const { serverDate, loading: dateLoading } = useReceivingServerDate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = () => {
    setIsLoading(true);
    apiClient.getDashboardStats(user?.receivingPoint?.id).then((res) => {
      if (res.success && res.data) setStats(res.data);
      setIsLoading(false);
    });
  };

  useEffect(() => { loadStats(); }, [user]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent" />
    </div>
  );

  const today = stats?.today;
  const totalVaultBalance = stats?.vaults?.reduce((sum, v) => sum + Number(v.balance), 0) ?? 0;
  const todayPending = today?.synced ?? 0;
  const todayPaid = today?.paid ?? 0;
  const todayTotal = today?.count ?? 0;
  const todayGHS = today?.totalGHS ?? 0;
  const disbursementRate = todayTotal > 0 ? Math.round((todayPaid / todayTotal) * 100) : 0;

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-GH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          {user?.receivingPoint && (
            <p className="text-xs text-gray-400 mt-0.5">{user.receivingPoint.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!dateLoading && (
            <span className="text-xs text-gray-400">{fmtDate(serverDate)}</span>
          )}
          <button
            onClick={loadStats}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pending',     value: todayPending, note: 'awaiting disbursement',      color: todayPending > 0 ? 'text-amber-600' : 'text-gray-900' },
          { label: 'Paid today',  value: todayPaid,    note: `${disbursementRate}% of today`, color: 'text-emerald-600' },
          { label: 'Total today', value: todayTotal,   note: 'transactions received',      color: 'text-gray-900'   },
          { label: "Today's GHS", value: `GHS ${fmt(todayGHS)}`, note: 'total value',      color: 'text-gray-900'   },
        ].map(({ label, value, note, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-xl font-semibold ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{note}</p>
          </div>
        ))}
      </div>

      {/* Vault float */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-800">Branch Float</p>
          <span className="text-xs text-gray-500">Total: <span className="font-semibold text-gray-700">GHS {fmt(totalVaultBalance)}</span></span>
        </div>
        {stats?.vaults && stats.vaults.length > 0 ? (
          <div className="space-y-3">
            {stats.vaults.map((v) => {
              const bal = Number(v.balance);
              const pct = Math.min(100, (bal / 10000) * 100);
              const isLow = bal < 1000;
              const isMid = bal >= 1000 && bal < 5000;
              return (
                <div key={v.id}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-700">{v.name}</span>
                    <span className={`font-semibold ${isLow ? 'text-red-600' : isMid ? 'text-amber-600' : 'text-gray-800'}`}>
                      GHS {fmt(bal)}
                      {isLow && <span className="ml-1.5 text-xs font-normal text-red-500">Critical</span>}
                      {isMid && <span className="ml-1.5 text-xs font-normal text-amber-500">Low</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-red-400' : isMid ? 'bg-amber-400' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-2">No vaults configured.</p>
        )}
      </div>

      {/* Disbursement progress */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-800">Disbursement progress</p>
          <span className="text-sm font-semibold text-emerald-700">{disbursementRate}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${disbursementRate}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{todayPaid} paid</span>
          <span>{todayPending} pending · {todayTotal} total</span>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {[
          { href: '/receiving/pending',        label: 'Pending Payments',    badge: todayPending > 0 ? todayPending : null },
          { href: '/receiving/till',           label: 'My Till',             badge: null },
          { href: '/receiving/reconciliation', label: 'Reconciliation',      badge: null },
          { href: '/receiving/disbursements',  label: 'Disbursement History',badge: null },
          { href: '/receiving/eod',            label: 'End of Day',          badge: null },
        ].map(({ href, label, badge }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <div className="flex items-center gap-2">
              {badge !== null && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                  {badge}
                </span>
              )}
              <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
