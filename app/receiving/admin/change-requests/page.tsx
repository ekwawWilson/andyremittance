'use client';

/**
 * Reversal & Edit Approvals.
 *
 * A teller who pays the wrong person cannot undo it themselves — they raise a
 * request, and the ledger only moves when someone here approves it. Approving a
 * reversal returns the cash to the till, puts the obligation back on the branch
 * and makes the transaction payable again.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiClient, type ChangeRequest, type ChangeRequestType } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { fmtGHS } from '@/lib/utils/format';

const TYPE_LABEL: Record<ChangeRequestType, string> = {
  DISBURSEMENT_REVERSAL: 'Reverse disbursement',
  TRANSACTION_EDIT: 'Edit transaction',
  TRANSACTION_CANCEL: 'Cancel transaction',
};

const TYPE_STYLE: Record<ChangeRequestType, string> = {
  DISBURSEMENT_REVERSAL: 'bg-amber-100 text-amber-800',
  TRANSACTION_EDIT: 'bg-blue-100 text-blue-800',
  TRANSACTION_CANCEL: 'bg-red-100 text-red-800',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-gray-100 text-gray-600',
};

export default function ChangeRequestsPage() {
  const { user } = useAuth();
  const canApprove = user?.permissions?.includes('APPROVE_TRANSACTION_CHANGE');

  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [approveTarget, setApproveTarget] = useState<ChangeRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ChangeRequest | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await apiClient.getChangeRequests({ status: statusFilter });
    if (res.success && res.data) setRequests(res.data);
    else setError(res.error ?? 'Could not load requests.');
    setIsLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSubmitting(true);
    setError('');
    const res = await apiClient.approveChangeRequest(approveTarget.id, note.trim() || undefined);
    if (res.success) {
      setNotice(res.message ?? 'Approved.');
      setApproveTarget(null);
      setNote('');
      await load();
    } else {
      setError(res.error ?? 'Could not approve the request.');
    }
    setSubmitting(false);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!note.trim()) { setError('A reason is required when rejecting.'); return; }
    setSubmitting(true);
    setError('');
    const res = await apiClient.rejectChangeRequest(rejectTarget.id, note.trim());
    if (res.success) {
      setNotice('Request rejected.');
      setRejectTarget(null);
      setNote('');
      await load();
    } else {
      setError(res.error ?? 'Could not reject the request.');
    }
    setSubmitting(false);
  };

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reversals &amp; Edits</h1>
          <p className="mt-1 text-sm text-gray-600">
            Requests to reverse a disbursement, amend payout details, or cancel a transaction.
            Nothing moves until a request is approved here.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        >
          <option value="PENDING">Pending {pendingCount > 0 ? `(${pendingCount})` : ''}</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="ALL">All</option>
        </select>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}

      {isLoading ? (
        <Card><CardContent className="p-10 text-center text-sm text-gray-500">Loading…</CardContent></Card>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-gray-500">
              No {statusFilter === 'ALL' ? '' : statusFilter.toLowerCase()} requests.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const t = r.transaction;
            const snap = (r.snapshot ?? {}) as Record<string, unknown>;
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${TYPE_STYLE[r.type]}`}>
                          {TYPE_LABEL[r.type]}
                        </span>
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                          {r.status}
                        </span>
                        <span className="font-mono text-xs font-bold text-blue-600">
                          {t?.transactionCode ?? String(snap.transactionCode ?? '—')}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-gray-800">
                        <span className="font-semibold">
                          {t ? `${t.sender.firstName} ${t.sender.lastName}`.trim() : String(snap.sender ?? '—')}
                        </span>
                        <span className="text-gray-400"> → </span>
                        <span className="font-semibold">
                          {t?.receiver ? `${t.receiver.firstName} ${t.receiver.lastName}`.trim() : String(snap.receiver ?? '—')}
                        </span>
                        <span className="ml-2 font-bold text-emerald-700">
                          {fmtGHS(Number(t?.ghsAmount ?? snap.ghsAmount ?? 0))}
                        </span>
                      </p>

                      <p className="mt-1.5 text-sm text-gray-600">
                        <span className="text-gray-400">Reason:</span> {r.reason}
                      </p>

                      {r.proposedChanges && Object.keys(r.proposedChanges).length > 0 && (
                        <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs">
                          <p className="mb-1 font-semibold text-gray-500">Proposed changes</p>
                          {Object.entries(r.proposedChanges).map(([k, v]) => (
                            <p key={k} className="text-gray-700">
                              <span className="text-gray-400">{k}:</span> {String(v)}
                            </p>
                          ))}
                        </div>
                      )}

                      <p className="mt-2 text-xs text-gray-400">
                        Raised by {r.requestedByName} · {new Date(r.requestedAt).toLocaleString('en-GH')}
                        {t?.paidByName && ` · originally paid by ${t.paidByName}`}
                      </p>
                      {r.status !== 'PENDING' && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {r.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {r.reviewedByName} ·{' '}
                          {r.reviewedAt ? new Date(r.reviewedAt).toLocaleString('en-GH') : ''}
                          {r.reviewNote && ` — ${r.reviewNote}`}
                        </p>
                      )}
                    </div>

                    {r.status === 'PENDING' && canApprove && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          onClick={() => { setApproveTarget(r); setNote(''); setError(''); }}
                          disabled={r.requestedById === user?.id}
                          title={r.requestedById === user?.id ? 'You raised this request — someone else must approve it' : undefined}
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setRejectTarget(r); setNote(''); setError(''); }}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {r.status === 'PENDING' && canApprove && r.requestedById === user?.id && (
                    <p className="mt-2 text-xs text-amber-700">
                      You raised this request — it must be approved by someone else.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Approve ─────────────────────────────────────────────────────── */}
      <Modal isOpen={!!approveTarget} onClose={() => setApproveTarget(null)} title="Approve request">
        {approveTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {approveTarget.type === 'DISBURSEMENT_REVERSAL' && (
                <>
                  This returns{' '}
                  <span className="font-semibold text-gray-900">
                    {fmtGHS(Number(approveTarget.transaction?.ghsAmount ?? 0))}
                  </span>{' '}
                  to the teller&apos;s till, puts the obligation back on the branch payable, and makes{' '}
                  <span className="font-mono font-semibold">{approveTarget.transaction?.transactionCode}</span>{' '}
                  payable again. The original journal is reversed, not deleted.
                </>
              )}
              {approveTarget.type === 'TRANSACTION_CANCEL' && (
                <>This voids the transaction, reversing any disbursement first. It cannot be undone.</>
              )}
              {approveTarget.type === 'TRANSACTION_EDIT' && (
                <>This applies the proposed changes to the transaction. Amounts are never editable.</>
              )}
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="Anything worth recording alongside the approval"
              />
            </div>

            {error && <p className="text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setApproveTarget(null)}>Cancel</Button>
              <Button onClick={handleApprove} isLoading={submitting}>Approve</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reject ──────────────────────────────────────────────────────── */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject request">
        {rejectTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Nothing on the transaction changes. The requester can raise a new request if needed.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Reason (required)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                placeholder="Why this request is being declined"
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleReject} isLoading={submitting}>Reject</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
