'use client';

import { useEffect, useState } from 'react';
import { apiClient, AdditionalTillReportEntry } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import ExportButtons from '@/components/ui/ExportButtons';

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function fmt(amount: number) {
  return amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdditionalTillReportPage() {
  const today = todayDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [transactionType, setTransactionType] = useState('IMMEDIATE');
  const [entries, setEntries] = useState<AdditionalTillReportEntry[]>([]);
  const [totalGHS, setTotalGHS] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    const res = await apiClient.getAdditionalTillReport({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      transactionType: transactionType || undefined,
    });

    if (res.success && res.data) {
      setEntries(res.data.entries);
      setTotalGHS(res.data.totalGHS);
    } else {
      setEntries([]);
      setTotalGHS(0);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void fetchReport();
  }, [startDate, endDate, transactionType]);

  const exportHeaders = ['Date', 'Transaction Code', 'Sender', 'Receiver', 'Branch', 'Amount (GHS)', 'Payment Mode', 'Reference Details'];
  const exportRows = entries.map((entry) => [
    entry.transactionDate,
    entry.transactionCode,
    entry.senderName,
    entry.receiverName,
    entry.receivingPointName,
    `GHS ${fmt(entry.amount)}`,
    entry.paymentMode,
    entry.referenceDetails,
  ]);
  const exportSummary = [
    { label: 'Entries', value: String(entries.length) },
    { label: 'Total Amount', value: `GHS ${fmt(totalGHS)}`, highlight: 'green' as const },
    { label: 'Ledger', value: 'ADDITIONAL_TILL', highlight: 'blue' as const },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Additional Till Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Immediate transactions posted through `ADDITIONAL_TILL`</p>
        </div>
        {entries.length > 0 && (
          <ExportButtons
            title="Additional Till Report"
            filename={`additional-till-report-${startDate}${endDate !== startDate ? `-to-${endDate}` : ''}`}
            headers={exportHeaders}
            rows={exportRows}
            summary={exportSummary}
            subtitle={`Period: ${startDate}${endDate !== startDate ? ` to ${endDate}` : ''}`}
          />
        )}
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Transaction Type</label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
              >
                <option value="IMMEDIATE">Immediate</option>
              </select>
            </div>
            {(startDate !== today || endDate !== today) && (
              <button
                onClick={() => { setStartDate(today); setEndDate(today); }}
                className="text-xs text-gray-500 hover:text-red-600 underline"
              >
                Reset to today
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent>
          <p className="text-xs text-gray-500 uppercase font-medium">Ledger</p>
          <p className="text-xl font-bold text-blue-700 mt-1">ADDITIONAL_TILL</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-gray-500 uppercase font-medium">Entries</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{entries.length}</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-gray-500 uppercase font-medium">Total Amount</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">GHS {fmt(totalGHS)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Code</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Sender</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Receiver</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Branch</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Amount</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Payment Mode</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Reference Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-500">{entry.transactionDate}</td>
                      <td className="py-3 px-4 font-mono text-xs text-blue-700 font-semibold">{entry.transactionCode}</td>
                      <td className="py-3 px-4 text-gray-700">{entry.senderName}</td>
                      <td className="py-3 px-4 text-gray-700">{entry.receiverName}</td>
                      <td className="py-3 px-4 text-gray-600">{entry.receivingPointName}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">GHS {fmt(entry.amount)}</td>
                      <td className="py-3 px-4 text-gray-600">{entry.paymentMode}</td>
                      <td className="py-3 px-4 text-gray-500">{entry.referenceDetails}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-emerald-50">
                    <td colSpan={5} className="py-3 px-4 font-semibold text-emerald-900">
                      Total ({entries.length} entr{entries.length === 1 ? 'y' : 'ies'})
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-800">GHS {fmt(totalGHS)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No immediate transactions posted to `ADDITIONAL_TILL` for the selected period.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
