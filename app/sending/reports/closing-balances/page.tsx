'use client';
import { useEffect, useState } from 'react';
import { apiClient, ClosingBalances } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import ExportButtons from '@/components/ui/ExportButtons';
import { fmtCAD, fmtGHS } from '@/lib/utils/format';

export default function ClosingBalancesPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<ClosingBalances | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = async () => {
    setIsLoading(true);
    const res = await apiClient.getClosingBalances(date);
    if (res.success && res.data) setData(res.data);
    setIsLoading(false);
  };

  useEffect(() => { fetch(); }, [date]);

  const s = data?.summary;
  const senders = data?.bySender ?? [];
  const owingSenders = senders.filter((s) => s.owingCAD > 0);

  const exportHeaders = ['Code', 'Sender', 'Receiver', 'CAD', 'GHS', 'Payment', 'Paid', 'Owing', 'Status'];
  const exportRows = (data?.transactions ?? []).map((t) => [
    t.transactionCode,
    `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`,
    `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`,
    fmtCAD(Number(t.cadAmount)),
    fmtGHS(Number(t.ghsAmount)),
    t.paymentMethod === 'E_TRANSFER' ? 'E-Transfer' : t.paymentMethod === 'SPLIT' ? 'Split' : 'Cash',
    fmtCAD(Number(t.amountPaidCAD)),
    fmtCAD(Number(t.amountPendingCAD)),
    t.status,
  ]);
  const exportSummary = [
    { label: 'Transactions', value: String(s?.totalTransactions ?? 0) },
    { label: 'Total Cash', value: fmtCAD(s?.totalCashCAD ?? 0), highlight: 'green' as const },
    { label: 'Total E-Transfers', value: fmtCAD(s?.totalETransferCAD ?? 0), highlight: 'blue' as const },
    { label: 'Total Owing', value: fmtCAD(s?.totalOwingCAD ?? 0), highlight: 'red' as const },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Closing Balances</h1>
        {!isLoading && (data?.transactions ?? []).length > 0 && (
          <ExportButtons title="Closing Balances" filename={`closing-balances-${date}`} headers={exportHeaders} rows={exportRows} summary={exportSummary} subtitle={`Date: ${date}`} />
        )}
      </div>

      {/* Date picker */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={fetch}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
            >
              Refresh
            </button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Primary summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Transactions</p>
                <p className="text-xl font-semibold text-gray-900 mt-1">{s?.totalTransactions ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total Cash</p>
                <p className="text-xl font-semibold text-green-600 mt-1">{fmtCAD(s?.totalCashCAD ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total E-Transfers</p>
                <p className="text-xl font-semibold text-blue-600 mt-1">{fmtCAD(s?.totalETransferCAD ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total Owing</p>
                <p className={`text-xl font-semibold mt-1 ${(s?.totalOwingCAD ?? 0) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {fmtCAD(s?.totalOwingCAD ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Secondary summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total CAD</p>
                <p className="text-lg font-semibold text-gray-800 mt-1">{fmtCAD(s?.totalCAD ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total GHS</p>
                <p className="text-lg font-semibold text-purple-700 mt-1">GHS {(s?.totalGHS ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total Paid</p>
                <p className="text-lg font-semibold text-green-700 mt-1">{fmtCAD(s?.totalPaidCAD ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Split Payments</p>
                <p className="text-lg font-semibold text-gray-700 mt-1">{fmtCAD(s?.totalSplitCAD ?? 0)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Sender owing breakdown — only when there are senders with outstanding amounts */}
          {owingSenders.length > 0 && (
            <Card className="mb-6">
              <CardHeader><CardTitle>Senders with Outstanding Balances</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Sender</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">Txns</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">Total CAD</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">Paid</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">Owing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owingSenders.map((sender) => (
                        <tr key={sender.senderId} className="border-b last:border-0 bg-red-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{sender.senderName}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{sender.transactions}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{fmtCAD(sender.totalCAD)}</td>
                          <td className="py-3 px-4 text-right text-green-700">{fmtCAD(sender.paidCAD)}</td>
                          <td className="py-3 px-4 text-right font-semibold text-red-700">{fmtCAD(sender.owingCAD)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full transaction detail */}
          <Card>
            <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
            <CardContent>
              {(data?.transactions ?? []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Code</th>
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Sender</th>
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Receiver</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">CAD</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">GHS</th>
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Payment</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">Paid</th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">Owing</th>
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.transactions.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 px-4 font-mono text-blue-600 text-xs">{t.transactionCode}</td>
                          <td className="py-3 px-4 text-gray-700">{t.sender?.firstName} {t.sender?.lastName}</td>
                          <td className="py-3 px-4 text-gray-700">{t.receiver?.firstName} {t.receiver?.lastName}</td>
                          <td className="py-3 px-4 text-right">{fmtCAD(Number(t.cadAmount))}</td>
                          <td className="py-3 px-4 text-right text-purple-700">{fmtGHS(Number(t.ghsAmount))}</td>
                          <td className="py-3 px-4 text-gray-600 text-xs">{t.paymentMethod === 'E_TRANSFER' ? 'E-Transfer' : t.paymentMethod === 'SPLIT' ? 'Split' : 'Cash'}</td>
                          <td className="py-3 px-4 text-right text-green-700">{fmtCAD(Number(t.amountPaidCAD))}</td>
                          <td className={`py-3 px-4 text-right font-semibold ${Number(t.amountPendingCAD) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {fmtCAD(Number(t.amountPendingCAD))}
                          </td>
                          <td className="py-3 px-4"><TransactionStatusBadge status={t.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No transactions for this date</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
