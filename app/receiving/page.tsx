'use client';
import { useEffect, useState } from 'react';
import { apiClient, DashboardStats } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingServerDate } from '@/lib/hooks/useReceivingServerDate';
import Link from 'next/link';

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub, color = 'text-gray-900' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function FloatHealthBar({ balance, label }: { balance: number; label: string }) {
  // Thresholds: green ≥ 5000, amber 1000-4999, red < 1000
  const color = balance >= 5000 ? 'bg-emerald-500' : balance >= 1000 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = balance >= 5000 ? 'text-emerald-700' : balance >= 1000 ? 'text-amber-700' : 'text-red-700';
  const bgColor = balance >= 5000 ? 'bg-emerald-50' : balance >= 1000 ? 'bg-amber-50' : 'bg-red-50';
  const status = balance >= 5000 ? 'Healthy' : balance >= 1000 ? 'Low Float' : 'Critical';
  const pct = Math.min(100, (balance / 10000) * 100);

  return (
    <div className={`flex-1 min-w-44 ${bgColor} border border-gray-200 rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 truncate mr-2">{label}</p>
        <span className={`text-xs font-bold ${textColor}`}>{status}</span>
      </div>
      <p className={`text-xl font-bold ${textColor} mb-2`}>GHS {fmt(balance)}</p>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ReceivingDashboard() {
  const { user } = useAuth();
  const { serverDate, loading: dateLoading } = useReceivingServerDate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadStats = () => {
    setIsLoading(true);
    apiClient.getDashboardStats(user?.receivingPoint?.id).then((res) => {
      if (res.success && res.data) setStats(res.data);
      setIsLoading(false);
      setLastRefresh(new Date());
    });
  };

  useEffect(() => { loadStats(); }, [user]);

  const s = stats?.summary;
  const today = stats?.today;
  const totalVaultBalance = stats?.vaults?.reduce((sum, v) => sum + Number(v.balance), 0) ?? 0;

  // Today's figures — scoped to the logged-in user's branch
  const todayPending = today?.synced ?? 0;       // SYNCED = awaiting disbursement today
  const todayPaid = today?.paid ?? 0;            // PAID today
  const todayTotal = today?.count ?? 0;          // all statuses today
  const todayGHS = today?.totalGHS ?? 0;
  const disbursementRate = todayTotal > 0 ? Math.round((todayPaid / todayTotal) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Receiving Dashboard</h1>
          {user?.receivingPoint && (
            <p className="text-sm text-gray-500 mt-1">
              {user.receivingPoint.name} &mdash; {user.receivingPoint.city}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Business date badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {dateLoading ? (
              <span className="h-3.5 w-24 bg-emerald-100 rounded animate-pulse inline-block" />
            ) : (
              <span className="text-xs font-semibold text-emerald-800">
                {new Date(serverDate + 'T12:00:00').toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">
            Updated {lastRefresh.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={loadStats}
            className="p-2 rounded-xl text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Pending Payments"
          value={todayPending}
          color={todayPending > 0 ? 'text-amber-600' : 'text-gray-900'}
          sub={todayPending > 0 ? 'awaiting disbursement today' : 'all clear for today'}
        />
        <StatCard
          label="Paid Out Today"
          value={todayPaid}
          color="text-emerald-600"
          sub={`${disbursementRate}% of today's transactions`}
        />
        <StatCard
          label="Total Today"
          value={todayTotal}
          sub="transactions received today"
        />
        <StatCard
          label="Today's GHS"
          value={`GHS ${fmt(todayGHS)}`}
          color="text-violet-600"
          sub="total value today"
        />
      </div>

      {/* Float / Vault Health */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Branch Float Health</h2>
            <span className="text-xs text-gray-500">Total: <span className="font-bold text-gray-700">GHS {fmt(totalVaultBalance)}</span></span>
          </div>
          {stats?.vaults && stats.vaults.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {stats.vaults.map((v) => (
                <FloatHealthBar key={v.id} balance={Number(v.balance)} label={v.name} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No vaults configured for this branch.</p>
          )}
        </CardContent>
      </Card>

      {/* Disbursement progress */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Today&apos;s Disbursement Progress</h2>
            <span className="text-sm font-semibold text-emerald-700">{disbursementRate}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-linear-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700"
              style={{ width: `${disbursementRate}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{todayPaid} paid today</span>
            <span>{todayPending} pending &middot; {todayTotal} total today</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            href: '/receiving/pending',
            icon: (
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            ),
            iconBg: 'bg-blue-100',
            title: 'Pending Payments',
            sub: `${todayPending} awaiting disbursement today`,
            badge: todayPending > 0 ? String(todayPending) : null,
            badgeColor: 'bg-blue-600',
          },
          {
            href: '/receiving/till',
            icon: (
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            ),
            iconBg: 'bg-emerald-100',
            title: 'My Till',
            sub: 'Cash position & daily statement',
            badge: null,
            badgeColor: '',
          },
          {
            href: '/receiving/reconciliation',
            icon: (
              <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            ),
            iconBg: 'bg-violet-100',
            title: 'Reconciliation',
            sub: 'End-of-day cash count',
            badge: null,
            badgeColor: '',
          },
          {
            href: '/receiving/disbursements',
            icon: (
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            ),
            iconBg: 'bg-orange-100',
            title: 'Disbursement History',
            sub: 'View paid transactions & reports',
            badge: null,
            badgeColor: '',
          },
          {
            href: '/receiving/eod',
            icon: (
              <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
            iconBg: 'bg-rose-100',
            title: 'Branch End of Day',
            sub: 'Close the branch business day',
            badge: null,
            badgeColor: '',
          },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="block">
            <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer h-full">
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className={`p-3 ${item.iconBg} rounded-xl shrink-0`}>{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                      {item.badge && (
                        <span className={`${item.badgeColor} text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{item.sub}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
