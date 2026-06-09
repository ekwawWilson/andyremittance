'use client';
import { useEffect, useState } from 'react';
import { apiClient, CashTransferRequest } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function TransferApprovalsPage() {
  const [requests, setRequests] = useState<CashTransferRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');

  const [rejectModal, setRejectModal] = useState<CashTransferRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState<string | null>(null);

  const fetchRequests = async () => {
    setIsLoading(true);
    const res = await apiClient.getTransferRequests(statusFilter ? { status: statusFilter } : undefined);
    if (res.success && res.data) setRequests(res.data);
    setIsLoading(false);
  };

  useEffect(() => { fetchRequests(); }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setActionSubmitting(id);
    const res = await apiClient.approveTransferRequest(id);
    if (res.success) fetchRequests();
    setActionSubmitting(null);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setRejectError('');
    setActionSubmitting(rejectModal.id);
    const res = await apiClient.rejectTransferRequest(rejectModal.id, rejectReason);
    if (res.success) {
      setRejectModal(null);
      setRejectReason('');
      fetchRequests();
    } else {
      setRejectError(res.error || 'Failed to reject');
    }
    setActionSubmitting(null);
  };

  const pending = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Cash Transfer Approvals</h1>
          {pending > 0 && (
            <p className="text-sm text-amber-600 mt-0.5">{pending} pending request{pending !== 1 ? 's' : ''} awaiting approval</p>
          )}
        </div>
        <div className="flex gap-2">
          {(['PENDING', 'APPROVED', 'REJECTED', ''] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>
          ) : requests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Teller</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">From (Vault)</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Amount</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Notes</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Requested</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {req.requestedBy?.firstName} {req.requestedBy?.lastName}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">{req.fromAccount?.accountName}</td>
                      <td className="py-3 px-4 font-semibold text-green-700">GHS {fmt(Number(req.amount))}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{req.notes || '—'}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {new Date(req.requestedAt).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[req.status]}`}>
                          {req.status}
                        </span>
                        {req.status === 'REJECTED' && req.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1">{req.rejectionReason}</p>
                        )}
                        {req.status === 'APPROVED' && req.approvedByName && (
                          <p className="text-xs text-green-600 mt-1">by {req.approvedByName}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {req.status === 'PENDING' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(req.id)}
                              isLoading={actionSubmitting === req.id}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => { setRejectModal(req); setRejectReason(''); setRejectError(''); }}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">No transfer requests found.</div>
          )}
        </CardContent>
      </Card>

      {/* Reject modal */}
      <Modal
        isOpen={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectReason(''); }}
        title="Reject Transfer Request"
        size="sm"
      >
        {rejectModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting transfer of <strong>GHS {fmt(Number(rejectModal.amount))}</strong> requested by{' '}
              <strong>{rejectModal.requestedBy?.firstName} {rejectModal.requestedBy?.lastName}</strong>.
            </p>
            {rejectError && <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{rejectError}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rejection</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="e.g. Insufficient vault balance, incorrect amount…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancel</Button>
              <Button
                onClick={handleReject}
                isLoading={!!actionSubmitting}
                disabled={!rejectReason.trim()}
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
