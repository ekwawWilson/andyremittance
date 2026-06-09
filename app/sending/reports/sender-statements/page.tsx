'use client';
import { useEffect, useState } from 'react';
import { apiClient, Sender, SenderStatement } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import ExportButtons from '@/components/ui/ExportButtons';
import { fmtCAD, fmtCADSigned } from '@/lib/utils/format';

export default function SenderStatementsPage() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [statement, setStatement] = useState<SenderStatement | null>(null);
  const [isLoadingSenders, setIsLoadingSenders] = useState(true);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [search, setSearch] = useState('');

  // Default to last 30 days
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  useEffect(() => {
    apiClient.getSenders({ limit: 200 }).then((res) => {
      if (res.success && res.data) setSenders(res.data.senders);
      setIsLoadingSenders(false);
    });
  }, []);

  const fetchStatement = async () => {
    if (!selectedSenderId) return;
    setIsLoadingStatement(true);
    const res = await apiClient.getSenderStatement(selectedSenderId, { startDate, endDate });
    if (res.success && res.data) setStatement(res.data);
    else setStatement(null);
    setIsLoadingStatement(false);
  };

  useEffect(() => {
    if (selectedSenderId) fetchStatement();
    else setStatement(null);
  }, [selectedSenderId]);

  const handleApply = () => {
    fetchStatement();
  };

  // Filter senders by search
  const filteredSenders = senders.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      s.phone.includes(search)
    );
  });

  // Export data
  const exportHeaders = ['Date', 'Type', 'Status', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'];
  const exportRows = (statement?.entries ?? []).map((e) => [
    e.date,
    e.type === 'TRANSACTION' ? 'Transaction' : e.type === 'PAYMENT' ? 'Payment' : 'Credit Note',
    e.status ?? '—',
    e.description,
    e.reference,
    e.debit > 0 ? fmtCAD(e.debit) : '',
    e.credit > 0 ? fmtCAD(e.credit) : '',
    fmtCADSigned(e.runningBalance),
  ]);
  const exportSummary = statement ? [
    { label: 'Opening Balance', value: fmtCADSigned(statement.summary.openingBalance) },
    { label: 'Total Debits', value: fmtCAD(statement.summary.totalDebits), highlight: 'red' as const },
    { label: 'Total Credits', value: fmtCAD(statement.summary.totalCredits), highlight: 'green' as const },
    { label: 'Closing Balance', value: fmtCADSigned(statement.summary.closingBalance), highlight: statement.summary.closingBalance < 0 ? 'red' as const : 'green' as const },
  ] : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Sender Statements</h1>
        {statement && statement.entries.length > 0 && (
          <ExportButtons
            title={`Statement - ${statement.sender.firstName} ${statement.sender.lastName}`}
            filename={`sender-statement-${statement.sender.firstName}-${statement.sender.lastName}-${startDate}-to-${endDate}`}
            headers={exportHeaders}
            rows={exportRows}
            summary={exportSummary}
            subtitle={`Period: ${startDate} to ${endDate}`}
          />
        )}
      </div>

      {/* Sender selection and date filters */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex gap-4 items-end flex-wrap">
            {/* Sender search/select */}
            <div className="w-full sm:w-64">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Sender</label>
              <input
                type="text"
                placeholder="Search senders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none mb-2"
              />
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              >
                <option value="">-- Select a sender --</option>
                {filteredSenders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} — {s.phone}
                  </option>
                ))}
              </select>
            </div>

            {/* Date filters */}
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
              onClick={handleApply}
              disabled={!selectedSenderId}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </CardContent>
      </Card>

      {isLoadingSenders ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : !selectedSenderId ? (
        <Card>
          <CardContent>
            <p className="text-gray-500 text-center py-8">Select a sender to view their statement</p>
          </CardContent>
        </Card>
      ) : isLoadingStatement ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : statement ? (
        <>
          {/* Sender info header */}
          <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {statement.sender.firstName} {statement.sender.lastName}
                </h2>
                <p className="text-sm text-gray-500">
                  {statement.sender.phone}
                  {statement.sender.email && <span className="ml-2">&middot; {statement.sender.email}</span>}
                  {statement.sender.accountCode && <span className="ml-2 text-gray-400">({statement.sender.accountCode})</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase">Current Balance</p>
                <p className={`text-xl font-bold ${statement.sender.currentBalance < 0 ? 'text-red-700' : statement.sender.currentBalance > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                  {fmtCADSigned(statement.sender.currentBalance)}
                </p>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Opening Balance</p>
                <p className={`text-xl font-bold mt-1 ${statement.summary.openingBalance < 0 ? 'text-red-600' : statement.summary.openingBalance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                  {fmtCADSigned(statement.summary.openingBalance)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total Debits</p>
                <p className="text-xl font-bold text-red-600 mt-1">{fmtCAD(statement.summary.totalDebits)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{statement.summary.transactionCount} txn{statement.summary.transactionCount !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Total Credits</p>
                <p className="text-xl font-bold text-green-600 mt-1">{fmtCAD(statement.summary.totalCredits)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{statement.summary.paymentCount} payment{statement.summary.paymentCount !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs text-gray-400 font-medium">Closing Balance</p>
                <p className={`text-xl font-bold mt-1 ${statement.summary.closingBalance < 0 ? 'text-red-600' : statement.summary.closingBalance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                  {fmtCADSigned(statement.summary.closingBalance)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Statement table */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {statement.entries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Type</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Description</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Reference</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Debit</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Credit</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Balance</th>
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
                        <td className={`py-3 px-4 text-right font-semibold ${statement.summary.openingBalance < 0 ? 'text-red-700' : statement.summary.openingBalance > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                          {fmtCADSigned(statement.summary.openingBalance)}
                        </td>
                      </tr>

                      {statement.entries.map((entry) => (
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
                        <td className="py-3 px-4 text-right font-semibold text-red-700">{fmtCAD(statement.summary.totalDebits)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-green-700">{fmtCAD(statement.summary.totalCredits)}</td>
                        <td className={`py-3 px-4 text-right font-bold text-lg ${statement.summary.closingBalance < 0 ? 'text-red-700' : statement.summary.closingBalance > 0 ? 'text-green-700' : 'text-gray-700'}`}>
                          {fmtCADSigned(statement.summary.closingBalance)}
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
        </>
      ) : (
        <Card>
          <CardContent>
            <p className="text-gray-500 text-center py-8">Failed to load statement</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
