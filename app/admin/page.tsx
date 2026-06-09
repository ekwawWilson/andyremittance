'use client';
import { useEffect, useState } from 'react';
import { apiClient, DashboardStats } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient.getDashboardStats().then((res) => { if (res.success && res.data) setStats(res.data); setIsLoading(false); });
  }, []);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div></div>
  );

  const s = stats?.summary;

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent><p className="text-xs text-gray-500 uppercase font-medium">Total Transactions</p><p className="text-2xl font-bold text-gray-900 mt-1">{s?.totalTransactions ?? 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-gray-500 uppercase font-medium">Today</p><p className="text-2xl font-bold text-blue-600 mt-1">{s?.todayTransactions ?? 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-gray-500 uppercase font-medium">Total CAD</p><p className="text-2xl font-bold text-green-600 mt-1">{Number(s?.totalCAD ?? 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-gray-500 uppercase font-medium">Total GHS</p><p className="text-2xl font-bold text-purple-600 mt-1">GHS {Number(s?.totalGHS ?? 0).toLocaleString()}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card><CardContent><p className="text-xs text-gray-500">Pending</p><p className="text-xl font-bold text-yellow-600">{s?.pendingTransactions ?? 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-gray-500">Synced</p><p className="text-xl font-bold text-blue-600">{s?.syncedTransactions ?? 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-gray-500">Paid</p><p className="text-xl font-bold text-green-600">{s?.paidTransactions ?? 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-gray-500">Cancelled</p><p className="text-xl font-bold text-red-600">{s?.cancelledTransactions ?? 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">All Vault Balances</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats?.vaults.map((v) => (
              <div key={v.id} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-xs text-purple-700 font-medium">{v.name}</p>
                {v.receivingPoint && <p className="text-xs text-purple-500">{v.receivingPoint.city}</p>}
                <p className="text-xl font-bold text-purple-800 mt-1">GHS {Number(v.balance).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
