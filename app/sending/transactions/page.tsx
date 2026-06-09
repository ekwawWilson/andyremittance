'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, Transaction, Sender, Receiver, ReceivingPoint } from '@/lib/api-client';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import TransactionReceipt from '@/components/ui/TransactionReceipt';
import { fmtCAD, fmtGHS } from '@/lib/utils/format';

export default function TransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [ownOnly, setOwnOnly] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const canSync    = user?.permissions?.includes('SYNC_TRANSACTIONS');
  const canViewAll = user?.permissions?.includes('VIEW_ALL_TRANSACTIONS');
  const canReprint = user?.permissions?.includes('REPRINT_RECEIPT');

  const doFetch = useCallback(async () => {
    setIsLoading(true);
    const params: Parameters<typeof apiClient.getTransactions>[0] = {
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };
    if (ownOnly && canViewAll) params.createdById = user?.id;
    const res = await apiClient.getTransactions(params);
    if (res.success && res.data) setTransactions(res.data.transactions);
    setIsLoading(false);
  }, [status, ownOnly, startDate, endDate, user]);

  useEffect(() => { doFetch(); }, [doFetch]);

  const filtered = search
    ? transactions.filter((t) => {
        const q = search.toLowerCase();
        return (
          t.transactionCode.toLowerCase().includes(q) ||
          `${t.sender?.firstName} ${t.sender?.lastName}`.toLowerCase().includes(q) ||
          `${t.receiver?.firstName} ${t.receiver?.lastName}`.toLowerCase().includes(q)
        );
      })
    : transactions;

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({
    cadAmount: '',
    amountPaidCAD: '',
    paymentMethod: 'CASH' as 'CASH' | 'E_TRANSFER' | 'SPLIT',
    receivingMode: 'CASH' as 'CASH' | 'BANK' | 'MOMO',
    receivingPointId: '',
    bankName: '', bankAccountNo: '', bankAccountName: '', bankBranch: '',
    momoNumber: '', momoName: '',
    notes: '',
    senderId: '',
    receiverId: '',
    transactionDate: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Edit modal supporting data
  const [editSenders, setEditSenders]     = useState<Sender[]>([]);
  const [editReceivers, setEditReceivers] = useState<Receiver[]>([]);
  const [editBranches, setEditBranches]   = useState<ReceivingPoint[]>([]);
  const [senderSearch, setSenderSearch]   = useState('');
  const [senderTimer, setSenderTimer]     = useState<ReturnType<typeof setTimeout> | null>(null);
  // Abort controller ref to prevent stale receiver results when sender changes rapidly
  const receiverFetchAbortRef = useRef<AbortController | null>(null);

  const openEdit = async (t: Transaction) => {
    setEditTx(t);
    setEditError('');
    setSenderSearch(`${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.trim());
    setEditForm({
      cadAmount:        String(t.cadAmount),
      amountPaidCAD:    String(t.amountPaidCAD),
      paymentMethod:    t.paymentMethod,
      receivingMode:    t.receivingMode,
      receivingPointId: t.receivingPoint?.id ?? '',
      bankName:         t.bankName || '',
      bankAccountNo:    t.bankAccountNo || '',
      bankAccountName:  t.bankAccountName || '',
      bankBranch:       t.bankBranch || '',
      momoNumber:       t.momoNumber || '',
      momoName:         t.momoName || '',
      notes:            t.notes || '',
      senderId:         (t.sender as Sender & { id: string })?.id ?? '',
      receiverId:       (t.receiver as Receiver & { id: string })?.id ?? '',
      transactionDate:  t.transactionDate ? t.transactionDate.slice(0, 10) : today,
    });

    const senderId = (t.sender as Sender & { id: string })?.id;
    const [sendersRes, receiversRes, branchesRes] = await Promise.all([
      apiClient.getSenders({ limit: 100 }),
      senderId ? apiClient.getReceivers({ senderId }) : Promise.resolve({ success: false, data: null }),
      apiClient.getReceivingPoints(),
    ]);
    if (sendersRes.success && sendersRes.data)     setEditSenders(sendersRes.data.senders);
    if (receiversRes.success && receiversRes.data) setEditReceivers(receiversRes.data as Receiver[]);
    if (branchesRes.success && branchesRes.data)   setEditBranches(branchesRes.data);
  };

  const onEditSenderChange = async (senderId: string) => {
    setEditForm((f) => ({ ...f, senderId, receiverId: '' }));
    setEditReceivers([]);
    if (!senderId) return;
    // Cancel any in-flight receiver fetch to prevent stale results arriving out of order
    if (receiverFetchAbortRef.current) receiverFetchAbortRef.current.abort();
    const controller = new AbortController();
    receiverFetchAbortRef.current = controller;
    const res = await apiClient.getReceivers({ senderId });
    if (controller.signal.aborted) return;
    if (res.success && res.data) setEditReceivers(res.data as Receiver[]);
  };

  const onSenderSearchChange = (q: string) => {
    setSenderSearch(q);
    if (senderTimer) clearTimeout(senderTimer);
    const t = setTimeout(async () => {
      const res = await apiClient.getSenders({ search: q, limit: 50 });
      if (res.success && res.data) setEditSenders(res.data.senders);
    }, 300);
    setSenderTimer(t);
  };

  const submitEdit = async () => {
    if (!editTx) return;

    // Client-side validation
    const cadAmt = Number(editForm.cadAmount);
    const paidAmt = Number(editForm.amountPaidCAD);
    if (!cadAmt || cadAmt <= 0) { setEditError('CAD amount must be greater than 0.'); return; }
    if (paidAmt > cadAmt + 0.001) { setEditError(`Amount paid (${fmtCAD(paidAmt)}) cannot exceed total (${fmtCAD(cadAmt)}).`); return; }
    if (editForm.receivingMode === 'BANK') {
      if (!editForm.bankName.trim()) { setEditError('Bank name is required.'); return; }
      if (!editForm.bankAccountNo.trim()) { setEditError('Account number is required.'); return; }
      if (!editForm.bankAccountName.trim()) { setEditError('Account name is required.'); return; }
      if (editForm.bankAccountNo.trim().length < 6) { setEditError('Account number must be at least 6 characters.'); return; }
    }
    if (editForm.receivingMode === 'MOMO' && !editForm.momoNumber.trim()) { setEditError('MoMo number is required.'); return; }

    setEditLoading(true);
    setEditError('');

    try {
      const payload: Record<string, unknown> = {
        cadAmount:        cadAmt,
        amountPaidCAD:    paidAmt,
        paymentMethod:    editForm.paymentMethod,
        receivingMode:    editForm.receivingMode,
        notes:            editForm.notes || null,
      };

      if (editForm.receivingPointId && editForm.receivingPointId !== (editTx.receivingPoint?.id ?? '')) {
        payload.receivingPointId = editForm.receivingPointId;
      }
      if (editForm.senderId && editForm.senderId !== ((editTx.sender as Sender & { id: string })?.id ?? '')) {
        payload.senderId = editForm.senderId;
      }
      if (editForm.receiverId !== ((editTx.receiver as Receiver & { id: string })?.id ?? '')) {
        payload.receiverId = editForm.receiverId || null;
      }
      if (editForm.transactionDate && editForm.transactionDate !== (editTx.transactionDate ? editTx.transactionDate.slice(0, 10) : today)) {
        payload.transactionDate = editForm.transactionDate;
      }

      if (editForm.receivingMode === 'BANK') {
        payload.bankName = editForm.bankName;
        payload.bankAccountNo = editForm.bankAccountNo;
        payload.bankAccountName = editForm.bankAccountName;
        payload.bankBranch = editForm.bankBranch;
        payload.momoNumber = null; payload.momoName = null;
      } else if (editForm.receivingMode === 'MOMO') {
        payload.momoNumber = editForm.momoNumber;
        payload.momoName = editForm.momoName;
        payload.bankName = null; payload.bankAccountNo = null; payload.bankAccountName = null; payload.bankBranch = null;
      } else {
        payload.bankName = null; payload.bankAccountNo = null; payload.bankAccountName = null; payload.bankBranch = null;
        payload.momoNumber = null; payload.momoName = null;
      }

      const res = await apiClient.updateTransaction(
        editTx.id,
        payload as Parameters<typeof apiClient.updateTransaction>[1]
      );
      if (res.success) { setEditTx(null); doFetch(); }
      else setEditError(res.error || 'Failed to update');
    } catch {
      setEditError('An unexpected error occurred. Please try again.');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete / Cancel ───────────────────────────────────────────────────────
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTx) return;
    setDeleteLoading(true);
    const res = await apiClient.deleteTransaction(deleteTx.id);
    if (res.success) { setDeleteTx(null); doFetch(); }
    setDeleteLoading(false);
  };

  // ── Receipt ───────────────────────────────────────────────────────────────
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null);

  // ── Collect remaining ─────────────────────────────────────────────────────
  const [collectTx, setCollectTx] = useState<Transaction | null>(null);
  const [collectMethod, setCollectMethod] = useState('CASH');
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');

  const handleCollectRemaining = async () => {
    if (!collectTx) return;
    setCollectLoading(true);
    setCollectMsg('');
    const res = await apiClient.collectRemaining(collectTx.id, collectMethod);
    if (res.success) { setCollectTx(null); doFetch(); }
    else setCollectMsg(res.error || 'Failed to collect remaining balance');
    setCollectLoading(false);
  };

  // ── Additional sync ───────────────────────────────────────────────────────
  const handleAdditionalSync = async () => {
    setSyncLoading(true);
    setSyncMsg('');
    const res = await apiClient.additionalSync();
    if (res.success && res.data) setSyncMsg(`${res.data.synced} additional transaction(s) synced`);
    else setSyncMsg(res.error || 'Sync failed');
    setSyncLoading(false);
  };

  const canAct = (t: Transaction) => {
    if (t.status === 'PAID' || t.status === 'CANCELLED') return false;
    if (t.syncedToReceiving) return false;
    return true;
  };

  const rowBg = (t: Transaction) => {
    if (t.status === 'CANCELLED') return 'opacity-50 hover:opacity-70';
    return 'hover:bg-gray-50';
  };

  const inputCls  = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-shadow bg-white';
  const labelCls  = 'block text-xs font-semibold text-gray-600 mb-1.5';
  const sectionHdr = 'text-xs font-medium text-gray-400 mt-5 mb-2 pb-1 border-b border-gray-100';

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canSync && (
            <Button variant="secondary" onClick={handleAdditionalSync} isLoading={syncLoading} size="sm">
              <svg className="w-4 h-4 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Sync Additional</span>
            </Button>
          )}
          <Link href="/sending/transactions/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </Link>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className={`p-3.5 rounded-xl text-sm font-medium flex items-center gap-2 ${syncMsg.includes('synced') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {syncMsg.includes('synced')
            ? <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          }
          {syncMsg}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col gap-3">
          {/* Search — full width */}
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search code, sender, receiver…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-shadow" />
          </div>
          {/* Dropdowns + date range */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select id="tx-status" label="" value={status} onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: '', label: 'All Statuses' }, { value: 'PENDING', label: 'Pending' },
                { value: 'SYNCED', label: 'Synced' }, { value: 'PAID', label: 'Paid' },
                { value: 'PARTIAL', label: 'Partial' }, { value: 'PARTIAL_PAYMENT', label: 'Partial Payment' }, { value: 'CANCELLED', label: 'Cancelled' },
              ]} />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            {canViewAll && (
              <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap cursor-pointer select-none">
                <div onClick={() => setOwnOnly(!ownOnly)}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${ownOnly ? 'bg-blue-600' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${ownOnly ? 'translate-x-4' : ''}`} />
                </div>
                Mine only
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Visibility notice for agents */}
      {!canViewAll && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Pending and Partial transactions shown are yours only. Synced and paid transactions are visible to all agents.
        </div>
      )}

      {/* Transactions list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : filtered.length > 0 ? (
          <>
            {/* ── Mobile card list (hidden sm+) ──────────────────────────── */}
            <div className="sm:hidden divide-y divide-gray-100">
              {filtered.map((t) => (
                <div key={t.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <Link href={`/sending/transactions/${t.id}`} className="font-mono font-bold text-blue-600 text-xs">
                      {t.transactionCode}
                    </Link>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <TransactionStatusBadge status={t.status} />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {t.sender?.firstName} {t.sender?.lastName}
                    <span className="text-gray-300 mx-1">→</span>
                    <span className="text-gray-500">{t.receiver?.firstName} {t.receiver?.lastName}</span>
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <div>
                      <span className="font-semibold text-gray-800">{fmtCAD(Number(t.cadAmount))}</span>
                      <span className="text-gray-400 mx-1.5">·</span>
                      <span className="text-gray-500 text-xs">{fmtGHS(Number(t.ghsAmount))}</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {canReprint && (
                        <button type="button" onClick={() => setReceiptTx(t)}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors font-medium">
                          Print
                        </button>
                      )}
                      {t.status === 'PARTIAL' && (
                        <button type="button" onClick={() => { setCollectTx(t); setCollectMethod('CASH'); setCollectMsg(''); }}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-orange-100 text-orange-700 font-semibold transition-colors">
                          Collect
                        </button>
                      )}
                      {canAct(t) && (
                        <>
                          <button type="button" onClick={() => openEdit(t)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-medium transition-colors">Edit</button>
                          <button type="button" onClick={() => setDeleteTx(t)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium transition-colors">Cancel</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop table (hidden below sm) ──────────────────────── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/70 border-b border-gray-100">
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-gray-400">Code</th>
                    <th className="text-left py-3.5 px-4 text-xs font-medium text-gray-400">Sender → Receiver</th>
                    {canViewAll && <th className="text-left py-3.5 px-4 text-xs font-medium text-gray-400">Agent</th>}
                    <th className="text-left py-3.5 px-4 text-xs font-medium text-gray-400">CAD</th>
                    <th className="text-left py-3.5 px-4 text-xs font-medium text-gray-400">GHS</th>
                    <th className="text-left py-3.5 px-4 text-xs font-medium text-gray-400">Branch / Mode</th>
                    <th className="text-left py-3.5 px-4 text-xs font-medium text-gray-400">Status</th>
                    <th className="text-left py-3.5 px-4 text-xs font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((t) => (
                    <tr key={t.id} className={`transition-colors ${rowBg(t)}`}>
                      <td className="py-4 px-5">
                        <Link href={`/sending/transactions/${t.id}`} className="font-mono font-bold text-blue-600 hover:text-blue-700 text-xs">
                          {t.transactionCode}
                        </Link>
                        <div className="mt-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${t.codeType === 'ADDITIONAL' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                            {t.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="font-medium text-gray-800">{t.sender?.firstName} {t.sender?.lastName}</span>
                        <span className="text-gray-300 mx-1.5">→</span>
                        <span className="text-gray-600">{t.receiver?.firstName} {t.receiver?.lastName}</span>
                      </td>
                      {canViewAll && (
                        <td className="py-4 px-4 text-gray-400 text-xs">{t.createdBy?.firstName} {t.createdBy?.lastName}</td>
                      )}
                      <td className="py-4 px-4">
                        <span className="font-semibold text-gray-800">{fmtCAD(Number(t.cadAmount))}</span>
                        {t.status === 'PARTIAL' && Number(t.amountPendingCAD) > 0 && (
                          <div className="text-xs font-medium text-orange-500 mt-0.5">{fmtCAD(Number(t.amountPendingCAD))} pending</div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-gray-500 text-xs">{fmtGHS(Number(t.ghsAmount))}</td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-700 font-medium">{t.receivingPoint?.name}</span>
                        <div className="mt-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${t.receivingMode === 'CASH' ? 'bg-green-100 text-green-700' : t.receivingMode === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {t.receivingMode}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <TransactionStatusBadge status={t.status} />
                        {t.syncedToReceiving && (
                          <div className="mt-1">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">Synced</span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {canReprint && (
                            <button type="button" onClick={() => setReceiptTx(t)}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              Print
                            </button>
                          )}
                          {t.status === 'PARTIAL' && (
                            <button type="button" onClick={() => { setCollectTx(t); setCollectMethod('CASH'); setCollectMsg(''); }}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 font-semibold transition-colors">
                              Collect {fmtCAD(Number(t.amountPendingCAD))}
                            </button>
                          )}
                          {canAct(t) && (
                            <>
                              <button type="button" onClick={() => openEdit(t)}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium transition-colors">
                                Edit
                              </button>
                              <button type="button" onClick={() => setDeleteTx(t)}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors">
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">No transactions found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>

      {/* ─── Edit Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={!!editTx} onClose={() => setEditTx(null)} title={`Edit Transaction — ${editTx?.transactionCode}`} size="lg">
        {editTx && (
          <div className="flex flex-col gap-0">
            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                {editError}
              </div>
            )}
            {editTx.syncedToReceiving && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs mb-3">
                This transaction has already been synced to the receiving portal and can no longer be edited from the sender portal.
              </div>
            )}

            <div className="max-h-[68vh] overflow-y-auto space-y-3 pr-1">

              {/* ── Parties ──────────────────────────────────────── */}
              <p className={sectionHdr}>Parties</p>

              <div>
                <label className={labelCls}>Sender</label>
                <input type="text" placeholder="Search sender by name…" value={senderSearch}
                  onChange={(e) => onSenderSearchChange(e.target.value)}
                  className={`${inputCls} mb-1.5`} />
                <select value={editForm.senderId}
                  onChange={(e) => {
                    const sel = editSenders.find((s) => (s as Sender & { id: string }).id === e.target.value);
                    setSenderSearch(sel ? `${sel.firstName} ${sel.lastName}` : '');
                    onEditSenderChange(e.target.value);
                  }}
                  className={inputCls}>
                  <option value="">— Select sender —</option>
                  {editSenders.map((s) => {
                    const sid = (s as Sender & { id: string }).id;
                    return <option key={sid} value={sid}>{s.firstName} {s.lastName}{s.phone ? ` · ${s.phone}` : ''}</option>;
                  })}
                </select>
              </div>

              <div>
                <label className={labelCls}>Receiver</label>
                <select value={editForm.receiverId}
                  onChange={(e) => setEditForm((f) => ({ ...f, receiverId: e.target.value }))}
                  disabled={!editForm.senderId}
                  className={inputCls}>
                  <option value="">— Select receiver —</option>
                  {editReceivers.map((r) => {
                    const rid = (r as Receiver & { id: string }).id;
                    return <option key={rid} value={rid}>{r.firstName} {r.lastName}{r.phone ? ` · ${r.phone}` : ''}</option>;
                  })}
                </select>
                {!editForm.senderId && <p className="text-xs text-gray-400 mt-1">Select a sender first to load their receivers.</p>}
              </div>

              {/* ── Amounts & Payment ─────────────────────────── */}
              <p className={sectionHdr}>Amounts & Payment</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>CAD Amount</label>
                  <input type="number" step="0.01" min="0" value={editForm.cadAmount}
                    onChange={(e) => setEditForm((f) => ({ ...f, cadAmount: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Amount Paid (CAD)</label>
                  <input type="number" step="0.01" min="0" value={editForm.amountPaidCAD}
                    onChange={(e) => setEditForm((f) => ({ ...f, amountPaidCAD: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Payment Method</label>
                <select value={editForm.paymentMethod}
                  onChange={(e) => setEditForm((f) => ({ ...f, paymentMethod: e.target.value as 'CASH' | 'E_TRANSFER' | 'SPLIT' }))}
                  className={inputCls}>
                  <option value="CASH">Cash</option>
                  <option value="E_TRANSFER">E-Transfer</option>
                  <option value="SPLIT">Split (Cash + E-Transfer)</option>
                </select>
              </div>

              {/* ── Receiving Details ─────────────────────────── */}
              <p className={sectionHdr}>Receiving Details</p>

              <div>
                <label className={labelCls}>Receiving Branch</label>
                <select value={editForm.receivingPointId}
                  onChange={(e) => setEditForm((f) => ({ ...f, receivingPointId: e.target.value }))}
                  className={inputCls}>
                  <option value="">— Select branch —</option>
                  {editBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}{b.city ? ` (${b.city})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Receiving Mode</label>
                <select value={editForm.receivingMode}
                  onChange={(e) => setEditForm((f) => ({
                    ...f, receivingMode: e.target.value as 'CASH' | 'BANK' | 'MOMO',
                    bankName: '', bankAccountNo: '', bankAccountName: '', bankBranch: '', momoNumber: '', momoName: '',
                  }))}
                  className={inputCls}>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank Transfer</option>
                  <option value="MOMO">Mobile Money</option>
                </select>
              </div>

              {editForm.receivingMode === 'BANK' && (
                <div className="space-y-2.5 pt-2 border-t border-gray-100">
                  <div>
                    <label className={labelCls}>Bank Name</label>
                    <input type="text" value={editForm.bankName} onChange={(e) => setEditForm((f) => ({ ...f, bankName: e.target.value }))} className={inputCls} placeholder="e.g. GCB Bank" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className={labelCls}>Account Number</label>
                      <input type="text" value={editForm.bankAccountNo} onChange={(e) => setEditForm((f) => ({ ...f, bankAccountNo: e.target.value }))} className={inputCls} minLength={6} maxLength={20} />
                    </div>
                    <div>
                      <label className={labelCls}>Account Name</label>
                      <input type="text" value={editForm.bankAccountName} onChange={(e) => setEditForm((f) => ({ ...f, bankAccountName: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Bank Branch</label>
                    <input type="text" value={editForm.bankBranch} onChange={(e) => setEditForm((f) => ({ ...f, bankBranch: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              )}

              {editForm.receivingMode === 'MOMO' && (
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-gray-100">
                  <div>
                    <label className={labelCls}>MoMo Number</label>
                    <input type="tel" value={editForm.momoNumber} onChange={(e) => setEditForm((f) => ({ ...f, momoNumber: e.target.value }))} className={inputCls} placeholder="e.g. 0551234567" minLength={9} maxLength={15} />
                  </div>
                  <div>
                    <label className={labelCls}>Name on Account</label>
                    <input type="text" value={editForm.momoName} onChange={(e) => setEditForm((f) => ({ ...f, momoName: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              )}

              {/* ── Metadata ──────────────────────────────────── */}
              <p className={sectionHdr}>Metadata</p>

              <div>
                <label className={labelCls}>Transaction Date</label>
                <input type="date" value={editForm.transactionDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, transactionDate: e.target.value }))}
                  className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea rows={2} placeholder="Optional note…" value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>

            </div>

            <div className="flex justify-end gap-3 pt-3 mt-1 border-t border-gray-100">
              <Button variant="secondary" type="button" onClick={() => setEditTx(null)}>Cancel</Button>
              <Button type="button" onClick={submitEdit} isLoading={editLoading}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Cancel Confirmation Modal ────────────────────────────────── */}
      <Modal isOpen={!!deleteTx} onClose={() => setDeleteTx(null)} title="Cancel Transaction" size="sm">
        {deleteTx && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm">
              <p className="font-semibold text-red-800 mb-1">Cancel <span className="font-mono">{deleteTx.transactionCode}</span>?</p>
              <p className="text-red-600 text-xs">This will mark the transaction as Cancelled and cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={() => setDeleteTx(null)}>Keep it</Button>
              <Button type="button" onClick={confirmDelete} isLoading={deleteLoading} className="bg-red-600 hover:bg-red-700">Yes, cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Receipt Modal ─────────────────────────────────────────────── */}
      {receiptTx && <TransactionReceipt transaction={receiptTx} onClose={() => setReceiptTx(null)} />}

      {/* ─── Collect Remaining Modal ────────────────────────────────────── */}
      <Modal isOpen={!!collectTx} onClose={() => setCollectTx(null)} title="Collect Remaining Balance" size="sm">
        {collectTx && (
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <p className="text-sm font-semibold text-orange-900">{collectTx.transactionCode}</p>
              <p className="text-sm text-orange-700 mt-0.5">
                {collectTx.sender?.firstName} {collectTx.sender?.lastName} → {collectTx.receiver?.firstName} {collectTx.receiver?.lastName}
              </p>
              <p className="text-xl font-bold text-orange-800 mt-2">{fmtCAD(Number(collectTx.amountPendingCAD))} remaining</p>
            </div>
            {collectMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{collectMsg}</div>}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Method</label>
              <select value={collectMethod} onChange={(e) => setCollectMethod(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="CASH">Cash</option>
                <option value="E_TRANSFER">E-Transfer</option>
                <option value="SPLIT">Split</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={() => setCollectTx(null)}>Cancel</Button>
              <Button type="button" onClick={handleCollectRemaining} isLoading={collectLoading}>Collect Payment</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
