'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, EndOfDayRecord, Transaction } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

function fmt(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EodHistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<EndOfDayRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<EndOfDayRecord | null>(null);

  const fetchHistory = async (p = page) => {
    setIsLoading(true);
    const res = await apiClient.getEndOfDayHistory({ page: p, limit: 15 });
    if (res.success && res.data) {
      setRecords(res.data.records);
      setTotalPages(res.data.pagination.totalPages);
      setTotal(res.data.pagination.total);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchHistory(page); }, [page]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push('/sending/eod')} className="text-blue-600 hover:underline text-sm mb-1 block">&larr; Back to End of Day</button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">EOD History</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} end-of-day records</p>
        </div>
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : records.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Business Date</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Closed By</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Closed At</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Transactions Synced</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Total CAD</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Total GHS</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => {
                      const totalCAD = r.transactions.reduce((s, t) => s + Number(t.cadAmount), 0);
                      const totalGHS = r.transactions.reduce((s, t) => s + Number(t.ghsAmount), 0);
                      return (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 px-4 font-semibold text-gray-900">
                            {new Date(r.date).toLocaleDateString('en-CA')}
                          </td>
                          <td className="py-3 px-4 text-gray-700">
                            {r.closedBy ? `${r.closedBy.firstName} ${r.closedBy.lastName}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-gray-500 text-xs">
                            {new Date(r.closedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                          </td>
                          <td className="py-3 px-4 font-bold text-blue-700">{r.syncedCount}</td>
                          <td className="py-3 px-4 font-medium text-green-700">${fmt(totalCAD)}</td>
                          <td className="py-3 px-4 font-medium text-purple-700">GHS {fmt(totalGHS)}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setSelectedRecord(r)}
                              className="text-xs px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                            >
                              View Batch
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
                  <div className="flex gap-1">
                    <button onClick={() => handlePageChange(page - 1)} disabled={page === 1}
                      className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
                      Prev
                    </button>
                    <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}
                      className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-center py-10">No end-of-day records found.</p>
          )}
        </CardContent>
      </Card>

      {/* Batch detail modal */}
      <Modal
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord ? `EOD Batch — ${new Date(selectedRecord.date).toLocaleDateString('en-CA')}` : ''}
        size="xl"
      >
        {selectedRecord && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Closed By</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {selectedRecord.closedBy ? `${selectedRecord.closedBy.firstName} ${selectedRecord.closedBy.lastName}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Total CAD</p>
                <p className="text-sm font-bold text-green-700 mt-0.5">
                  ${fmt(selectedRecord.transactions.reduce((s, t) => s + Number(t.cadAmount), 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Total GHS</p>
                <p className="text-sm font-bold text-purple-700 mt-0.5">
                  GHS {fmt(selectedRecord.transactions.reduce((s, t) => s + Number(t.ghsAmount), 0))}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 sticky top-0">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Code</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Sender</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Receiver</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">CAD</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">GHS</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Branch</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRecord.transactions.map((t: Transaction) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-blue-600 text-xs">{t.transactionCode}</td>
                      <td className="py-2 px-3 text-gray-700 text-xs">{t.sender?.firstName} {t.sender?.lastName}</td>
                      <td className="py-2 px-3 text-gray-700 text-xs">{t.receiver?.firstName} {t.receiver?.lastName}</td>
                      <td className="py-2 px-3 text-xs">${fmt(t.cadAmount)}</td>
                      <td className="py-2 px-3 text-xs">GHS {fmt(t.ghsAmount)}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{t.receivingPoint?.name || '—'}</td>
                      <td className="py-2 px-3"><TransactionStatusBadge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="secondary" onClick={() => { setSelectedRecord(null); window.print(); }}>
                Export / Print
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
