'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient, Receiver, Transaction } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

function fmt(n: number | string): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  SYNCED: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-orange-100 text-orange-800',
  PARTIAL_PAYMENT: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default function ReceiverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [receiver, setReceiver] = useState<Receiver | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [txnLoading, setTxnLoading] = useState(false);

  // Filters & pagination
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    apiClient.getReceiver(id).then((res) => {
      if (res.success && res.data) {
        setReceiver(res.data);
      } else {
        router.push('/sending/receivers');
      }
      setIsLoading(false);
    });
  }, [id, router]);

  const fetchTransactions = async (p = page, sd = startDate, ed = endDate) => {
    setTxnLoading(true);
    const res = await apiClient.getTransactions({
      receiverId: id,
      startDate: sd || undefined,
      endDate: ed || undefined,
      page: p,
      limit: PAGE_SIZE,
    });
    if (res.success && res.data) {
      setTransactions(res.data.transactions);
      setTotalPages(res.data.pagination.totalPages);
      setTotal(res.data.pagination.total);
    }
    setTxnLoading(false);
  };

  useEffect(() => {
    if (!isLoading) fetchTransactions(page, startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleFilter = () => {
    setPage(1);
    fetchTransactions(1, startDate, endDate);
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
    fetchTransactions(1, '', '');
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchTransactions(newPage, startDate, endDate);
  };

  const handleExportPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!receiver) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button
          onClick={() => router.push('/sending/receivers')}
          className="text-blue-600 hover:underline text-sm"
        >
          &larr; Back to Receivers
        </button>
        <Button onClick={handleExportPDF} variant="secondary">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export to PDF
        </Button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Receiver Details</h1>
        <p className="text-sm text-gray-500">Printed on {new Date().toLocaleDateString('en-CA')}</p>
      </div>

      {/* Receiver Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{receiver.firstName} {receiver.lastName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Phone</p>
              <p className="text-gray-900 font-medium">{receiver.phone}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Email</p>
              <p className="text-gray-900 font-medium">{receiver.email || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Sender</p>
              <p className="text-gray-900 font-medium">
                {receiver.sender ? `${receiver.sender.firstName} ${receiver.sender.lastName}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Relationship</p>
              <p className="text-gray-900 font-medium">{receiver.relationshipToSender || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">ID Type</p>
              <p className="text-gray-900 font-medium">{receiver.idType || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">ID Number</p>
              <p className="text-gray-900 font-medium">{receiver.idNumber || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Preferred Method</p>
              <span className={`inline-flex mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                receiver.preferredMethod === 'CASH' ? 'bg-green-100 text-green-800' :
                receiver.preferredMethod === 'BANK' ? 'bg-blue-100 text-blue-800' :
                'bg-purple-100 text-purple-800'
              }`}>
                {receiver.preferredMethod}
              </span>
            </div>
            {receiver.preferredMethod === 'BANK' && (
              <>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Bank</p>
                  <p className="text-gray-900 font-medium">{receiver.bankName || '—'}{receiver.bankBranch ? ` — ${receiver.bankBranch}` : ''}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Account No.</p>
                  <p className="text-gray-900 font-medium">{receiver.bankAccount || '—'}</p>
                </div>
              </>
            )}
            {receiver.preferredMethod === 'MOMO' && (
              <>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">MoMo Number</p>
                  <p className="text-gray-900 font-medium">{receiver.momoNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Provider</p>
                  <p className="text-gray-900 font-medium">{receiver.momoProvider || '—'}</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Transactions {total > 0 && <span className="text-sm font-normal text-gray-500 ml-1">({total})</span>}</CardTitle>
            {/* Date filter — hidden on print */}
            <div className="flex items-center gap-2 print:hidden flex-wrap">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <Button onClick={handleFilter} size="sm">Filter</Button>
              {(startDate || endDate) && (
                <button
                  onClick={handleClearFilter}
                  className="text-xs text-gray-500 hover:text-red-600 underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {txnLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : transactions.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Code</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">CAD</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">GHS</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Branch</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-600">
                          {new Date(t.transactionDate).toLocaleDateString('en-CA')}
                        </td>
                        <td className="py-3 px-4 font-medium text-blue-600">{t.transactionCode}</td>
                        <td className="py-3 px-4">${fmt(t.cadAmount)}</td>
                        <td className="py-3 px-4">GHS {fmt(t.ghsAmount)}</td>
                        <td className="py-3 px-4 text-gray-600">{t.receivingPoint?.name || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[t.status] ?? 'bg-gray-100 text-gray-800'}`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t print:hidden">
                  <p className="text-sm text-gray-500">
                    Page {page} of {totalPages} &middot; {total} total
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePageChange(1)}
                      disabled={page === 1}
                      className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                    >
                      «
                    </button>
                    <button
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                      className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                    >
                      Prev
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                      const pageNum = start + i;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-1 text-xs rounded border ${pageNum === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page === totalPages}
                      className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => handlePageChange(totalPages)}
                      disabled={page === totalPages}
                      className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                    >
                      »
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-center py-8">
              {startDate || endDate ? 'No transactions found for the selected date range.' : 'No transactions found.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
