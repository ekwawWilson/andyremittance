'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

interface Reconciliation {
  id: string;
  tellerId: string;
  teller?: { firstName: string; lastName: string };
  receivingPointId: string;
  receivingPoint?: { name: string; code: string };
  reconciliationDate: string;
  openingBalance: number;
  vaultTransfersIn: number;
  paymentsMade: number;
  returnsToVault: number;
  expectedClosing: number;
  actualClosing: number;
  variance: number;
  status: 'PENDING' | 'COMPLETED' | 'APPROVED' | 'REJECTED';
  approvedByName?: string;
  approvedAt?: string;
  notes?: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

function fmt(n: number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReconciliationsPage() {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');

  const [rejectModal, setRejectModal] = useState<Reconciliation | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState<string | null>(null);

  const fetchReconciliations = async () => {
    setIsLoading(true);
    const res = await apiClient.getReconciliations(statusFilter ? { status: statusFilter } : undefined);
    if (res.success && res.data) setReconciliations(res.data as Reconciliation[]);
    setIsLoading(false);
  };

  useEffect(() => { fetchReconciliations(); }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setActionSubmitting(id);
    const res = await apiClient.approveReconciliation(id);
    if (res.success) fetchReconciliations();
    setActionSubmitting(null);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setRejectError('');
    setActionSubmitting(rejectModal.id);
    const res = await apiClient.rejectReconciliation(rejectModal.id, rejectReason);
    if (res.success) {
      setRejectModal(null);
      setRejectReason('');
      fetchReconciliations();
    } else {
      setRejectError(res.error || 'Failed');
    }
    setActionSubmitting(null);
  };

  const pending = reconciliations.filter((r) => r.status === 'PENDING').length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Teller Reconciliations</h1>
          {pending > 0 && (
            <p className="text-sm text-amber-600 mt-0.5">{pending} pending reconciliation{pending !== 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="flex gap-2">
          {(['PENDING', 'COMPLETED', 'APPROVED', 'REJECTED', ''] as const).map((s) => (
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
          ) : reconciliations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Teller</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Opening</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Vault In</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Paid Out</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Return</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Expected</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Actual</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">Variance</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {new Date(r.reconciliationDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {r.teller?.firstName} {r.teller?.lastName}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">{fmt(r.openingBalance)}</td>
                      <td className="py-3 px-4 text-right text-blue-600">{fmt(r.vaultTransfersIn)}</td>
                      <td className="py-3 px-4 text-right text-orange-600">{fmt(r.paymentsMade)}</td>
                      <td className="py-3 px-4 text-right text-purple-600">{fmt(r.returnsToVault)}</td>
                      <td className="py-3 px-4 text-right text-gray-700 font-medium">{fmt(r.expectedClosing)}</td>
                      <td className="py-3 px-4 text-right font-semibold">{fmt(r.actualClosing)}</td>
                      <td className={`py-3 px-4 text-right font-semibold ${Number(r.variance) === 0 ? 'text-green-600' : Number(r.variance) > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {Number(r.variance) > 0 ? '+' : ''}{fmt(r.variance)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>
                          {r.status}
                        </span>
                        {r.approvedByName && <p className="text-xs text-gray-400 mt-0.5">by {r.approvedByName}</p>}
                      </td>
                      <td className="py-3 px-4">
                        {r.status === 'PENDING' && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApprove(r.id)} isLoading={actionSubmitting === r.id}>
                              Approve
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => { setRejectModal(r); setRejectReason(''); setRejectError(''); }}>
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
            <div className="text-center py-12 text-gray-500">No reconciliations found.</div>
          )}
        </CardContent>
      </Card>

      {/* Reject modal */}
      <Modal isOpen={!!rejectModal} onClose={() => { setRejectModal(null); setRejectReason(''); }} title="Reject Reconciliation" size="sm">
        {rejectModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting reconciliation for <strong>{rejectModal.teller?.firstName} {rejectModal.teller?.lastName}</strong> — variance:{' '}
              <span className={Number(rejectModal.variance) < 0 ? 'text-red-600 font-bold' : 'font-bold'}>GHS {fmt(rejectModal.variance)}</span>
            </p>
            {rejectError && <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{rejectError}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancel</Button>
              <Button onClick={handleReject} isLoading={!!actionSubmitting} disabled={!rejectReason.trim()}>Confirm Reject</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
