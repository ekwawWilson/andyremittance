'use client';
import { useEffect, useState } from 'react';
import { apiClient, Sender } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Link from 'next/link';
import ExportButtons from '@/components/ui/ExportButtons';
import { fmtCAD, fmtCADSigned } from '@/lib/utils/format';

type BalanceFilter = 'all' | 'outstanding' | 'zero';

export default function SenderBalancesPage() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<BalanceFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient.getSenders({ limit: 200 }).then((res) => {
      if (res.success && res.data) setSenders(res.data.senders);
      setIsLoading(false);
    });
  }, []);

  // Derive balance for each sender
  const withBalance = senders.map((s) => ({
    ...s,
    balance: Number(s.senderLedger?.balance ?? 0),
  }));

  // Summary stats (unfiltered, unSearched)
  const outstanding = withBalance.filter((s) => s.balance < 0);
  const zeroBal = withBalance.filter((s) => s.balance === 0);
  const totalOwing = outstanding.reduce((sum, s) => sum + Math.abs(s.balance), 0);

  // Apply filter then search
  const filtered = withBalance
    .filter((s) => {
      if (filter === 'outstanding') return s.balance < 0;
      if (filter === 'zero') return s.balance === 0;
      return true;
    })
    .filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.phone.includes(search)
      );
    })
    .sort((a, b) => a.balance - b.balance); // most negative first

  const exportHeaders = ['Sender', 'Phone', 'Transactions', 'Credit Limit', 'Balance', 'Status'];
  const exportRows = filtered.map((s) => {
    const isOwing = s.balance < 0;
    const isZero = s.balance === 0;
    return [
      `${s.firstName} ${s.lastName}`,
      s.phone,
      s._count?.transactions ?? 0,
      fmtCAD(Number(s.creditLimit)),
      fmtCADSigned(s.balance),
      isOwing ? 'Owing' : isZero ? 'Zero' : 'Credit',
    ];
  });
  const exportSummary = [
    { label: 'Total Senders', value: String(withBalance.length) },
    { label: 'Outstanding', value: String(outstanding.length), highlight: 'red' as const },
    { label: 'Total Owing', value: fmtCAD(totalOwing), highlight: 'red' as const },
    { label: 'Zero Balance', value: String(zeroBal.length) },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Sender Balances</h1>
        {filtered.length > 0 && (
          <ExportButtons title="Sender Balances" filename={`sender-balances-${new Date().toISOString().split('T')[0]}`} headers={exportHeaders} rows={exportRows} summary={exportSummary} />
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent>
            <p className="text-xs text-gray-400 font-medium">Total Senders</p>
            <p className="text-xl font-semibold text-gray-900 mt-1">{withBalance.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-400 font-medium">Outstanding</p>
            <p className="text-xl font-semibold text-red-600 mt-1">{outstanding.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-400 font-medium">Total Owing</p>
            <p className="text-xl font-semibold text-red-600 mt-1">{fmtCAD(totalOwing)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-400 font-medium">Zero Balance</p>
            <p className="text-xl font-semibold text-gray-600 mt-1">{zeroBal.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter + search bar */}
      <Card className="mb-4">
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle pills */}
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              {(['all', 'outstanding', 'zero'] as BalanceFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-sm px-3 py-1 rounded-md font-medium transition-colors ${
                    filter === f
                      ? f === 'outstanding'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-white shadow text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'outstanding' ? 'Outstanding' : 'Zero Balance'}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Balance table */}
      <Card>
        <CardContent>
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Sender</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Phone</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Txns</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Credit Limit</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Balance</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const isOwing = s.balance < 0;
                    const isZero = s.balance === 0;
                    return (
                      <tr key={s.id} className={`border-b last:border-0 ${isOwing ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                        <td className="py-3 px-4">
                          <Link href={`/sending/senders/${s.id}`} className="text-blue-600 hover:underline font-medium">
                            {s.firstName} {s.lastName}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{s.phone}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{s._count?.transactions ?? 0}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{fmtCAD(Number(s.creditLimit))}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${isOwing ? 'text-red-700' : isZero ? 'text-gray-500' : 'text-green-700'}`}>
                          {fmtCADSigned(s.balance)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${isOwing ? 'bg-red-100 text-red-700' : isZero ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                            {isOwing ? 'Owing' : isZero ? 'Zero' : 'Credit'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No senders match the current filter</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
