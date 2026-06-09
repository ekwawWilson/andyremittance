'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiClient, Transaction } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

type ActionType = 'FLAGGED' | 'RESTORE';

const STATUS_STYLES: Record<string, string> = {
  PENDING:         'bg-gray-100 text-gray-600',
  SYNCED:          'bg-blue-100 text-blue-700',
  PAID:            'bg-emerald-100 text-emerald-700',
  PARTIAL_PAYMENT: 'bg-amber-100 text-amber-700',
  CANCELLED:       'bg-red-100 text-red-700',
  VOID:            'bg-red-200 text-red-800',
  FLAGGED:         'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING:         'Pending',
  SYNCED:          'Synced',
  PAID:            'Paid',
  PARTIAL_PAYMENT: 'Partial',
  CANCELLED:       'Cancelled',
  VOID:            'Void',
  FLAGGED:         'Flagged',
};

const MODE_STYLES: Record<string, string> = {
  CASH: 'bg-green-100 text-green-700',
  BANK: 'bg-blue-100 text-blue-700',
  MOMO: 'bg-purple-100 text-purple-700',
};

const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none';

export default function AdminTransactionsPage() {
  const { user } = useAuth();

  // Filters
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 7) + '-01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Flag modal state
  const [modalTx, setModalTx] = useState<Transaction | null>(null);
  const [modalAction, setModalAction] = useState<ActionType | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canFlag = user?.permissions?.includes('FLAG_TRANSACTION') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiClient.getTransactions({
      startDate: from,
      endDate: to,
      receivingPointId: user?.receivingPoint?.id || undefined,
      limit: 200,
    });
    if (res.success && res.data) {
      setTransactions(res.data.transactions);
    } else {
      setError(res.error ?? 'Failed to load transactions');
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const filtered = transactions.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const senderName = `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.toLowerCase();
      const receiverName = `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.toLowerCase();
      if (
        !t.transactionCode.toLowerCase().includes(q) &&
        !senderName.includes(q) &&
        !receiverName.includes(q)
      ) return false;
    }
    return true;
  });

  const openModal = (tx: Transaction, action: ActionType) => {
    setModalTx(tx);
    setModalAction(action);
    setReason('');
    setReasonError('');
  };

  const closeModal = () => {
    setModalTx(null);
    setModalAction(null);
    setReason('');
    setReasonError('');
  };

  const handleSubmit = async () => {
    if (!modalTx || !modalAction) return;
    if (!reason.trim()) { setReasonError('Reason / remarks is required'); return; }
    setSubmitting(true);
    setReasonError('');
    const res = await apiClient.flagTransaction(modalTx.id, modalAction, reason.trim());
    if (res.success && res.data) {
      setTransactions((prev) => prev.map((t) => t.id === res.data!.id ? res.data! : t));
      closeModal();
    } else {
      setReasonError(res.error ?? 'Failed to update transaction');
    }
    setSubmitting(false);
  };

  const fmtGHS = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });

  const actionLabel: Record<ActionType, string> = {
    FLAGGED: 'Flag with Issue',
    RESTORE: 'Restore Transaction',
  };
  const actionColor: Record<ActionType, string> = {
    FLAGGED: 'bg-orange-500 hover:bg-orange-600',
    RESTORE: 'bg-emerald-600 hover:bg-emerald-700',
  };
  const actionBorderColor: Record<ActionType, string> = {
    FLAGGED: 'border-orange-200',
    RESTORE: 'border-emerald-200',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Transaction Management</h1>
        <p className="text-sm text-gray-400 mt-0.5">Review and hold receiving transactions with issues</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            type="text"
            placeholder="Search code, sender, receiver…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} w-64`}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} w-40`}>
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
          <button
            onClick={load}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {loading ? 'Loading…' : `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`}
          </span>
          <div className="flex gap-2 text-xs">
            {['VOID', 'FLAGGED'].map((s) => (
              <span key={s} className={`px-2 py-0.5 rounded-md font-semibold ${STATUS_STYLES[s]}`}>
                {filtered.filter((t) => t.status === s).length} {STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-emerald-600 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No transactions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60">
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sender</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Receiver</th>
                  <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Amount</th>
                  <th className="text-center py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Mode</th>
                  <th className="text-center py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Flag Reason</th>
                  {canFlag && (
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t) => {
                  const senderName = `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.trim();
                  const receiverName = `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim() || '—';
                  const isSoftFlaggedPaid =
                    t.status === 'PAID' &&
                    !!t.flagReason;
                  const isHeld = t.status === 'FLAGGED';
                  const isRestorable = isHeld || isSoftFlaggedPaid;
                  const canFlagHere =
                    !isRestorable &&
                    ['SYNCED', 'PARTIAL_PAYMENT', 'PAID'].includes(t.status);

                  return (
                    <tr key={t.id} className={`hover:bg-gray-50/60 transition-colors ${isRestorable ? 'bg-orange-50/30' : ''}`}>
                      <td className="py-3 px-4 font-mono text-xs text-blue-600 font-bold whitespace-nowrap">{t.transactionCode}</td>
                      <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{fmtDate(t.transactionDate)}</td>
                      <td className="py-3 px-4 font-medium text-gray-800">{senderName}</td>
                      <td className="py-3 px-4 text-gray-600">{receiverName}</td>
                      <td className="py-3 px-4 text-right font-bold text-gray-800 whitespace-nowrap">{fmtGHS(Number(t.ghsAmount))}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${MODE_STYLES[t.receivingMode] ?? 'bg-gray-100 text-gray-600'}`}>
                          {t.receivingMode}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${STATUS_STYLES[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[t.status] ?? t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-[180px]">
                        {t.flagReason ? (
                          <div>
                            <p className="text-xs text-gray-700 truncate" title={t.flagReason}>{t.flagReason}</p>
                            {t.flaggedByName && (
                              <p className="text-[10px] text-gray-400 mt-0.5">{t.flaggedByName}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      {canFlag && (
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {isRestorable && (
                              <button
                                onClick={() => openModal(t, 'RESTORE')}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold rounded-lg border border-emerald-200 transition-colors whitespace-nowrap"
                              >
                                Restore
                              </button>
                            )}
                            {canFlagHere && (
                              <button
                                onClick={() => openModal(t, 'FLAGGED')}
                                className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[11px] font-semibold rounded-lg border border-orange-200 transition-colors whitespace-nowrap"
                              >
                                {t.status === 'PAID' ? 'Flag Issue' : 'Flag'}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Flag / Restore Modal */}
      {modalTx && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 border ${actionBorderColor[modalAction]}`}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{actionLabel[modalAction]}</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {modalTx.transactionCode} · {`${modalTx.sender?.firstName ?? ''} ${modalTx.sender?.lastName ?? ''}`.trim()}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Current flag info if restoring */}
              {modalAction === 'RESTORE' && modalTx.flagReason && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs text-gray-500 font-medium mb-1">Current reason on record:</p>
                  <p className="text-sm text-gray-700">{modalTx.flagReason}</p>
                  {modalTx.flaggedByName && (
                    <p className="text-xs text-gray-400 mt-1">— {modalTx.flaggedByName}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  {modalAction === 'RESTORE' ? 'Reason for restoring' : 'Remarks / Reason'} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setReasonError(''); }}
                  rows={3}
                  placeholder={
                    modalAction === 'FLAGGED'
                      ? 'e.g. Incorrect receiver details, amount discrepancy…'
                      : 'e.g. Issue resolved, transaction confirmed valid…'
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
                />
                {reasonError && <p className="text-xs text-red-600 mt-1">{reasonError}</p>}
              </div>

              {modalAction === 'FLAGGED' && (
                <div className="p-3 bg-orange-50 rounded-xl border border-orange-200">
                  <p className="text-xs text-orange-700 font-medium">
                    Flagging places the transaction on hold in receiving until an authorized user restores it.
                  </p>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !reason.trim()}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 ${actionColor[modalAction]}`}
              >
                {submitting ? 'Saving…' : actionLabel[modalAction]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
