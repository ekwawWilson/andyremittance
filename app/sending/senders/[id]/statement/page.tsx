'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, SenderStatement } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import ExportButtons from '@/components/ui/ExportButtons';
import { fmtCAD, fmtCADSigned } from '@/lib/utils/format';

export default function SenderStatementPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [statement, setStatement] = useState<SenderStatement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Default to last 30 days
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const fetchStatement = async () => {
    setIsLoading(true);
    const res = await apiClient.getSenderStatement(id, { startDate, endDate });
    if (res.success && res.data) {
      setStatement(res.data);
    } else {
      router.push('/sending/senders');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStatement();
  }, [id]);

  const handleFilter = () => {
    fetchStatement();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!statement) return null;

  const { sender, summary, entries } = statement;

  const exportHeaders = ['Date', 'Type', 'Status', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'];
  const exportRows = entries.map((e) => [
    e.date,
    e.type === 'TRANSACTION' ? 'Transaction' : e.type === 'PAYMENT' ? 'Payment' : 'Credit Note',
    e.status ?? '—',
    e.description,
    e.reference,
    e.debit > 0 ? fmtCAD(e.debit) : '',
    e.credit > 0 ? fmtCAD(e.credit) : '',
    fmtCADSigned(e.runningBalance),
  ]);
  const exportSummary = [
    { label: 'Opening Balance', value: fmtCADSigned(summary.openingBalance) },
    { label: 'Total Debits', value: fmtCAD(summary.totalDebits), highlight: 'red' as const },
    { label: 'Total Credits', value: fmtCAD(summary.totalCredits), highlight: 'green' as const },
    { label: 'Closing Balance', value: fmtCADSigned(summary.closingBalance), highlight: summary.closingBalance < 0 ? 'red' as const : 'green' as const },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href={`/sending/senders/${id}`} className="text-blue-600 hover:underline text-sm">
              &larr; Back to Sender
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Statement</h1>
          <p className="text-gray-500 text-sm mt-1">
            {sender.firstName} {sender.lastName} &middot; {sender.phone}
            {sender.accountCode && <span className="text-gray-400 ml-2">({sender.accountCode})</span>}
          </p>
        </div>
        {entries.length > 0 && (
          <ExportButtons
            title={`Statement - ${sender.firstName} ${sender.lastName}`}
            filename={`sender-statement-${sender.firstName}-${sender.lastName}-${startDate}-to-${endDate}`}
            headers={exportHeaders}
            rows={exportRows}
            summary={exportSummary}
            subtitle={`Period: ${startDate} to ${endDate}`}
          />
        )}
      </div>

      {/* Date filters */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleFilter}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-medium">Opening Balance</p>
            <p className={`text-xl font-bold mt-1 ${summary.openingBalance < 0 ? 'text-red-600' : summary.openingBalance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
              {fmtCADSigned(summary.openingBalance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-medium">Total Debits</p>
            <p className="text-xl font-bold text-red-600 mt-1">{fmtCAD(summary.totalDebits)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{summary.transactionCount} transaction{summary.transactionCount !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-medium">Total Credits</p>
            <p className="text-xl font-bold text-green-600 mt-1">{fmtCAD(summary.totalCredits)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{summary.paymentCount} payment{summary.paymentCount !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-medium">Closing Balance</p>
            <p className={`text-xl font-bold mt-1 ${summary.closingBalance < 0 ? 'text-red-600' : summary.closingBalance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
              {fmtCADSigned(summary.closingBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current balance indicator */}
      <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Current Account Balance</p>
          <p className="text-xs text-gray-400">As of today</p>
        </div>
        <p className={`text-2xl font-bold ${sender.currentBalance < 0 ? 'text-red-700' : sender.currentBalance > 0 ? 'text-green-700' : 'text-gray-600'}`}>
          {fmtCADSigned(sender.currentBalance)}
          <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${sender.currentBalance < 0 ? 'bg-red-100 text-red-700' : sender.currentBalance > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {sender.currentBalance < 0 ? 'Owing' : sender.currentBalance > 0 ? 'Credit' : 'Settled'}
          </span>
        </p>
      </div>

      {/* Statement table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Type</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Description</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Reference</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Debit</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Credit</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b bg-blue-50">
                    <td className="py-3 px-4 text-gray-700">{startDate}</td>
                    <td className="py-3 px-4" colSpan={4}>
                      <span className="text-blue-700 font-medium">Opening Balance</span>
                    </td>
                    <td className="py-3 px-4"></td>
                    <td className="py-3 px-4"></td>
                    <td className={`py-3 px-4 text-right font-semibold ${summary.openingBalance < 0 ? 'text-red-700' : summary.openingBalance > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                      {fmtCADSigned(summary.openingBalance)}
                    </td>
                  </tr>

                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-600">{entry.date}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            entry.type === 'TRANSACTION'
                              ? 'bg-purple-100 text-purple-700'
                              : entry.type === 'PAYMENT'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {entry.type === 'TRANSACTION' ? 'Transaction' : entry.type === 'PAYMENT' ? 'Payment' : 'Credit'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{entry.status ?? '—'}</td>
                      <td className="py-3 px-4 text-gray-700">{entry.description}</td>
                      <td className="py-3 px-4 font-mono text-blue-600 text-xs">{entry.reference}</td>
                      <td className="py-3 px-4 text-right text-red-600">
                        {entry.debit > 0 ? fmtCAD(entry.debit) : ''}
                      </td>
                      <td className="py-3 px-4 text-right text-green-600">
                        {entry.credit > 0 ? fmtCAD(entry.credit) : ''}
                      </td>
                      <td className={`py-3 px-4 text-right font-semibold ${entry.runningBalance < 0 ? 'text-red-700' : entry.runningBalance > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                        {fmtCADSigned(entry.runningBalance)}
                      </td>
                    </tr>
                  ))}

                  {/* Closing balance row */}
                  <tr className="bg-gray-100 border-t-2 border-gray-300">
                    <td className="py-3 px-4 text-gray-700 font-semibold">{endDate}</td>
                    <td className="py-3 px-4" colSpan={4}>
                      <span className="text-gray-900 font-semibold">Closing Balance</span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-red-700">{fmtCAD(summary.totalDebits)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-green-700">{fmtCAD(summary.totalCredits)}</td>
                    <td className={`py-3 px-4 text-right font-bold text-lg ${summary.closingBalance < 0 ? 'text-red-700' : summary.closingBalance > 0 ? 'text-green-700' : 'text-gray-700'}`}>
                      {fmtCADSigned(summary.closingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No transactions in this period</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
