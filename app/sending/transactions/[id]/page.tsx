'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, Transaction, SubPayment } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import TransactionReceipt from '@/components/ui/TransactionReceipt';
import { printMultiReceiverStatement } from '@/lib/print-receipt';
import { fmtCAD, fmtGHS, fmtNum } from '@/lib/utils/format';

interface LedgerEntry {
  id: string;
  debitAccount: { accountName: string; accountCode: string };
  creditAccount: { accountName: string; accountCode: string };
  amount: number;
  currency: string;
  entryType: string;
  createdAt: string;
}

interface FullTransaction extends Transaction {
  exchangeRate?: { cadToGhs: number };
  ledgerEntries?: LedgerEntry[];
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [tx, setTx] = useState<FullTransaction | null>(null);
  const [subPayments, setSubPayments] = useState<SubPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLedger, setShowLedger] = useState(false);

  // Receipt
  const [showReceipt, setShowReceipt] = useState(false);

  // Collect remaining
  const [showCollect, setShowCollect] = useState(false);
  const [collectMethod, setCollectMethod] = useState('CASH');
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');

  // Change to Immediate
  const [showChangeType, setShowChangeType] = useState(false);
  const [changeTypeLoading, setChangeTypeLoading] = useState(false);
  const [changeTypeError, setChangeTypeError] = useState('');

  // Cancel confirm
  const [showCancel, setShowCancel] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Inline edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    cadAmount: '',
    amountPaidCAD: '',
    receivingMode: 'CASH' as 'CASH' | 'BANK' | 'MOMO',
    bankName: '',
    bankAccountNo: '',
    bankAccountName: '',
    bankBranch: '',
    momoNumber: '',
    momoName: '',
    notes: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'].includes(user?.role ?? '');
  const canReprint = user?.permissions?.includes('REPRINT_RECEIPT');

  const load = async () => {
    setIsLoading(true);
    const [txRes, spRes] = await Promise.all([
      apiClient.getTransaction(id),
      apiClient.getSubPayments(id),
    ]);
    if (txRes.success && txRes.data) {
      setTx(txRes.data as FullTransaction);
    } else {
      setError(txRes.error || 'Transaction not found');
    }
    if (spRes.success && spRes.data && typeof spRes.data === 'object' && 'subPayments' in spRes.data) {
      setSubPayments((spRes.data as { subPayments: SubPayment[] }).subPayments ?? []);
    }
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const canAct = () => {
    if (!tx) return false;
    if (tx.status === 'PAID' || tx.status === 'CANCELLED') return false;
    if (tx.syncedToReceiving) return false;
    return true;
  };

  const openEdit = () => {
    if (!tx) return;
    setEditError('');
    setEditForm({
      cadAmount: String(tx.cadAmount),
      amountPaidCAD: String(tx.amountPaidCAD),
      receivingMode: tx.receivingMode,
      bankName: tx.bankName || '',
      bankAccountNo: tx.bankAccountNo || '',
      bankAccountName: tx.bankAccountName || '',
      bankBranch: tx.bankBranch || '',
      momoNumber: tx.momoNumber || '',
      momoName: tx.momoName || '',
      notes: tx.notes || '',
    });
    setShowEdit(true);
  };

  const submitEdit = async () => {
    if (!tx) return;

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
      if (!editForm.bankBranch.trim()) { setEditError('Bank branch is required.'); return; }
    }
    if (editForm.receivingMode === 'MOMO' && !editForm.momoNumber.trim()) { setEditError('MoMo number is required.'); return; }

    setEditLoading(true);
    setEditError('');
    try {
      const payload: Record<string, unknown> = {
        cadAmount: cadAmt,
        amountPaidCAD: paidAmt,
        receivingMode: editForm.receivingMode,
        notes: editForm.notes || undefined,
      };
      if (editForm.receivingMode === 'BANK') {
        payload.bankName = editForm.bankName;
        payload.bankAccountNo = editForm.bankAccountNo;
        payload.bankAccountName = editForm.bankAccountName;
        payload.bankBranch = editForm.bankBranch;
        payload.momoNumber = null;
        payload.momoName = null;
      } else if (editForm.receivingMode === 'MOMO') {
        payload.momoNumber = editForm.momoNumber;
        payload.momoName = editForm.momoName;
        payload.bankName = null;
        payload.bankAccountNo = null;
        payload.bankAccountName = null;
        payload.bankBranch = null;
      } else {
        payload.bankName = null; payload.bankAccountNo = null; payload.bankAccountName = null; payload.bankBranch = null;
        payload.momoNumber = null; payload.momoName = null;
      }
      const res = await apiClient.updateTransaction(tx.id, payload as Parameters<typeof apiClient.updateTransaction>[1]);
      if (res.success) {
        setShowEdit(false);
        load();
      } else {
        setEditError(res.error || 'Failed to update');
      }
    } catch {
      setEditError('An unexpected error occurred. Please try again.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleCollect = async () => {
    if (!tx) return;
    setCollectLoading(true);
    setCollectMsg('');
    const res = await apiClient.collectRemaining(tx.id, collectMethod);
    if (res.success) {
      setShowCollect(false);
      load();
    } else {
      setCollectMsg(res.error || 'Failed to collect remaining balance');
    }
    setCollectLoading(false);
  };

  const handleCancel = async () => {
    if (!tx) return;
    setCancelLoading(true);
    const res = await apiClient.deleteTransaction(tx.id);
    if (res.success) {
      setShowCancel(false);
      router.push('/sending/transactions');
    }
    setCancelLoading(false);
  };

  const handleChangeToImmediate = async () => {
    if (!tx) return;
    setChangeTypeLoading(true);
    setChangeTypeError('');
    const res = await apiClient.updateTransaction(tx.id, { codeType: 'ADDITIONAL' });
    if (res.success) {
      setShowChangeType(false);
      load();
    } else {
      setChangeTypeError(res.error || 'Failed to change transaction type');
    }
    setChangeTypeLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">{error || 'Transaction not found'}</p>
        <Link href="/sending/transactions" className="mt-4 inline-block text-blue-600 hover:underline text-sm">← Back to Transactions</Link>
      </div>
    );
  }

  const isMultiReceiver = (tx.transactionReceivers?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/sending/transactions" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Transactions
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-gray-900">{tx.transactionCode}</h1>
            <TransactionStatusBadge status={tx.status} />
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tx.codeType === 'ADDITIONAL' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
              {tx.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{new Date(tx.createdAt).toLocaleString()}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* People & Amounts */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Transaction Details</h2>
            </div>
            <div className="px-6 py-5">
              {/* Sender / Receiver */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-medium">Sender</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{tx.sender?.firstName} {tx.sender?.lastName}</p>
                    {tx.sender?.phone && <p className="text-xs text-gray-500">{tx.sender.phone}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-medium">{isMultiReceiver ? 'Primary Receiver' : 'Receiver'}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{tx.receiver?.firstName} {tx.receiver?.lastName}</p>
                    {tx.receiver?.phone && <p className="text-xs text-gray-500">{tx.receiver.phone}</p>}
                  </div>
                </div>
              </div>

              {/* Amount highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-b border-gray-100">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-500 font-medium">CAD Sent</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{fmtCAD(Number(tx.cadAmount))}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-500 font-medium">GHS Received</p>
                  <p className="text-lg font-bold text-green-700 mt-1">{fmtGHS(Number(tx.ghsAmount))}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 font-medium">Paid</p>
                  <p className="text-lg font-bold text-gray-700 mt-1">{fmtCAD(Number(tx.amountPaidCAD))}</p>
                </div>
                {Number(tx.amountPendingCAD) > 0 ? (
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-orange-500 font-medium">Pending</p>
                    <p className="text-lg font-bold text-orange-700 mt-1">{fmtCAD(Number(tx.amountPendingCAD))}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 font-medium">Rate</p>
                    <p className="text-sm font-semibold text-gray-600 mt-1">
                      {tx.exchangeRate ? `${Number(tx.exchangeRate.cadToGhs).toFixed(4)}` : `${Number(tx.exchangeRateUsed).toFixed(4)}`}
                    </p>
                    <p className="text-xs text-gray-400">CAD/GHS</p>
                  </div>
                )}
              </div>

              {/* Details grid */}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-5">
                <InfoRow label="Payment Method">
                  {tx.paymentMethod.replace('_', ' ')}
                </InfoRow>
                <InfoRow label="Receiving Mode">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tx.receivingMode === 'CASH' ? 'bg-green-100 text-green-700' : tx.receivingMode === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {tx.receivingMode}
                  </span>
                </InfoRow>
                <InfoRow label="Branch">{tx.receivingPoint?.name || '—'}</InfoRow>
                <InfoRow label="Exchange Rate">
                  1 CAD = {tx.exchangeRate ? Number(tx.exchangeRate.cadToGhs).toFixed(4) : Number(tx.exchangeRateUsed).toFixed(4)} GHS
                </InfoRow>
                {tx.receivingMode === 'BANK' && (
                  <>
                    {tx.bankName && <InfoRow label="Bank Name">{tx.bankName}</InfoRow>}
                    {tx.bankAccountNo && <InfoRow label="Account No.">{tx.bankAccountNo}</InfoRow>}
                    {tx.bankAccountName && <InfoRow label="Account Name">{tx.bankAccountName}</InfoRow>}
                    {tx.bankBranch && <InfoRow label="Bank Branch">{tx.bankBranch}</InfoRow>}
                  </>
                )}
                {tx.receivingMode === 'MOMO' && (
                  <>
                    {tx.momoNumber && <InfoRow label="MoMo Number">{tx.momoNumber}</InfoRow>}
                    {tx.momoName && <InfoRow label="Name on Number">{tx.momoName}</InfoRow>}
                  </>
                )}
                <InfoRow label="Created By">{tx.createdBy?.firstName} {tx.createdBy?.lastName}</InfoRow>
                <InfoRow label="Transaction Date">{new Date(tx.transactionDate ?? tx.createdAt).toLocaleDateString()}</InfoRow>
                {tx.paidByName && <InfoRow label="Paid By">{tx.paidByName}</InfoRow>}
                {tx.paidAt && <InfoRow label="Paid At">{new Date(tx.paidAt).toLocaleString()}</InfoRow>}
                {tx.notes && (
                  <div className="col-span-2">
                    <InfoRow label="Notes">{tx.notes}</InfoRow>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Multi-receiver Statement of Payment */}
          {isMultiReceiver && (() => {
            const allocs = tx.transactionReceivers!;
            const totalGHS = allocs.reduce((s, r) => s + Number(r.ghsAmount), 0);
            const paidGHS  = allocs.filter((r) => r.isPaid).reduce((s, r) => s + Number(r.ghsAmount), 0);
            const paidCount = allocs.filter((r) => r.isPaid).length;
            let running = totalGHS;
            return (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-gray-100 bg-violet-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-violet-900">Statement of Payment</h2>
                    <p className="text-xs text-violet-600 mt-0.5">
                      {allocs.length} receiver allocation{allocs.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                      {paidCount} paid &nbsp;·&nbsp; {allocs.length - paidCount} pending
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => printMultiReceiverStatement(
                      tx,
                      tx.receivingPoint?.name ?? 'Branch',
                      allocs.map((r) => ({
                        receiverName:  r.receiver ? `${r.receiver.firstName} ${r.receiver.lastName}` : (r.receiverName ?? '—'),
                        receiverPhone: r.receiver?.phone ?? r.receiverPhone ?? '—',
                        ghsAmount: Number(r.ghsAmount),
                        notes: r.notes,
                        isPaid: r.isPaid,
                        paidAt: r.paidAt,
                        paidByName: r.paidByName,
                      }))
                    )}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-violet-300 bg-white text-violet-700 text-xs font-semibold hover:bg-violet-50 transition-colors shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Statement
                  </button>
                </div>

                {/* KPI bar */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Total GHS</p>
                    <p className="text-base font-bold text-violet-700 mt-0.5">{fmtGHS(totalGHS)}</p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Paid Out</p>
                    <p className="text-base font-bold text-emerald-600 mt-0.5">{fmtGHS(paidGHS)}</p>
                    <p className="text-[10px] text-gray-400">{paidCount} of {allocs.length}</p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Outstanding</p>
                    <p className={`text-base font-bold mt-0.5 ${totalGHS - paidGHS > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{fmtGHS(totalGHS - paidGHS)}</p>
                    <p className="text-[10px] text-gray-400">{allocs.length - paidCount} pending</p>
                  </div>
                </div>

                {/* Mobile card list */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {allocs.map((r, i) => {
                    const name  = r.receiver ? `${r.receiver.firstName} ${r.receiver.lastName}` : (r.receiverName ?? '—');
                    const phone = r.receiver?.phone ?? r.receiverPhone ?? '—';
                    const bal   = running - (r.isPaid ? Number(r.ghsAmount) : 0);
                    if (r.isPaid) running -= Number(r.ghsAmount);
                    return (
                      <div key={r.id} className={`px-4 py-3 ${r.isPaid ? '' : 'bg-amber-50/50'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-gray-400 font-mono">#{i + 1}</span>
                              <p className="text-sm font-semibold text-gray-900">{name}</p>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {r.isPaid ? 'PAID' : 'PENDING'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{phone}</p>
                            {r.notes && <p className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded mt-1 inline-block">{r.notes}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-800">{fmtGHS(Number(r.ghsAmount))}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Bal: {fmtGHS(bal)}</p>
                          </div>
                        </div>
                        {r.isPaid && (
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                            <span>{r.paidAt ? new Date(r.paidAt).toLocaleString() : ''}</span>
                            {r.paidByName && <span>· {r.paidByName}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/60 border-b border-gray-100">
                        <th className="text-center py-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-8">#</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Receiver</th>
                        <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">GHS Amount</th>
                        <th className="text-center py-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Paid At</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Teller</th>
                        <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let runningDesk = totalGHS;
                        return allocs.map((r, i) => {
                          const name  = r.receiver ? `${r.receiver.firstName} ${r.receiver.lastName}` : (r.receiverName ?? '—');
                          const phone = r.receiver?.phone ?? r.receiverPhone ?? '—';
                          const balAfter = r.isPaid ? runningDesk - Number(r.ghsAmount) : runningDesk;
                          if (r.isPaid) runningDesk -= Number(r.ghsAmount);
                          return (
                            <tr key={r.id} className={`border-b last:border-0 ${r.isPaid ? 'hover:bg-gray-50' : 'bg-amber-50/40 hover:bg-amber-50'}`}>
                              <td className="py-3 px-3 text-center text-xs text-gray-400 font-mono">{i + 1}</td>
                              <td className="py-3 px-4">
                                <p className="font-semibold text-gray-900">{name}</p>
                                <p className="text-xs text-gray-400">{phone}</p>
                                {r.notes && <p className="text-xs text-amber-700 mt-0.5">{r.notes}</p>}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-gray-800">{fmtGHS(Number(r.ghsAmount))}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${r.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {r.isPaid ? 'PAID' : 'PENDING'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs text-gray-500">
                                {r.paidAt ? new Date(r.paidAt).toLocaleString() : '—'}
                              </td>
                              <td className="py-3 px-4 text-xs text-gray-500">{r.paidByName || '—'}</td>
                              <td className={`py-3 px-4 text-right font-semibold ${r.isPaid ? 'text-emerald-600' : 'text-gray-400'}`}>
                                {fmtGHS(balAfter)}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                    <tfoot>
                      <tr className="bg-violet-50 border-t-2 border-violet-200">
                        <td colSpan={2} className="py-3 px-4 text-xs font-semibold text-violet-700">
                          Total &nbsp;·&nbsp; {allocs.length} allocations
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-violet-700">{fmtGHS(totalGHS)}</td>
                        <td className="py-3 px-4 text-center text-xs text-violet-600">{paidCount}/{allocs.length}</td>
                        <td colSpan={2} className="py-3 px-4 text-xs text-violet-600">{allocs.length - paidCount} pending</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">{fmtGHS(totalGHS - paidGHS)} remaining</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Sub-payments */}
          {subPayments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Partial Payments</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Paid By</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">GHS Amount</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subPayments.map((sp) => (
                      <tr key={sp.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-5 text-gray-600">{new Date(sp.paidAt).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-gray-700">{sp.paidByName}</td>
                        <td className="py-3 px-4 font-semibold text-green-700">{fmtGHS(Number(sp.ghsAmount))}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{sp.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ledger Entries — collapsible */}
          {(tx.ledgerEntries?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowLedger((v) => !v)}
                className="w-full flex items-center justify-between px-6 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <span>Ledger Entries ({tx.ledgerEntries!.length})</span>
                <svg className={`w-4 h-4 transition-transform ${showLedger ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showLedger && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-2.5 px-4 font-semibold text-gray-500">Type</th>
                        <th className="text-left py-2.5 px-4 font-semibold text-gray-500">Debit Account</th>
                        <th className="text-left py-2.5 px-4 font-semibold text-gray-500">Credit Account</th>
                        <th className="text-left py-2.5 px-4 font-semibold text-gray-500">Amount</th>
                        <th className="text-left py-2.5 px-4 font-semibold text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tx.ledgerEntries!.map((le) => (
                        <tr key={le.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2.5 px-4 font-mono text-gray-600">{le.entryType}</td>
                          <td className="py-2.5 px-4 text-gray-700">{le.debitAccount?.accountName} <span className="text-gray-400">({le.debitAccount?.accountCode})</span></td>
                          <td className="py-2.5 px-4 text-gray-700">{le.creditAccount?.accountName} <span className="text-gray-400">({le.creditAccount?.accountCode})</span></td>
                          <td className="py-2.5 px-4 font-semibold">{le.currency} {fmtNum(Number(le.amount))}</td>
                          <td className="py-2.5 px-4 text-gray-400">{new Date(le.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — Status & Actions */}
        <div className="space-y-4">
          {/* Status card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">Status</p>
            <div className="flex justify-center mb-5">
              <span className="text-base">
                <TransactionStatusBadge status={tx.status} />
              </span>
            </div>
          {tx.syncedToReceiving && (
            <div className="mb-4 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <p className="font-semibold">Synced to receiving branch</p>
              <p className="mt-0.5 text-blue-600">This record is locked. Edits and cancellation are no longer available from the sender portal.</p>
            </div>
          )}
            {tx.receiversDeferred && (
              <div className="mb-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <p className="font-semibold">Receivers deferred</p>
                <p className="mt-0.5">Receivers and GHS allocations will be assigned by the teller at the receiving branch during disbursement.</p>
              </div>
            )}
            <div className="space-y-2">
              {canReprint && (
                <Button variant="secondary" className="w-full" type="button" onClick={() => setShowReceipt(true)}>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Receipt
                </Button>
              )}
              {tx.status === 'PARTIAL' && (
                <Button className="w-full" type="button" onClick={() => { setShowCollect(true); setCollectMethod('CASH'); setCollectMsg(''); }}>
                  Collect Remaining ({fmtCAD(Number(tx.amountPendingCAD))})
                </Button>
              )}
              {canAct() && (
                <>
                  <Button variant="secondary" className="w-full" type="button" onClick={openEdit}>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Transaction
                  </Button>
                  {isAdmin && tx.codeType === 'STANDARD' && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      type="button"
                      onClick={() => { setShowChangeType(true); setChangeTypeError(''); }}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Change to Immediate
                    </Button>
                  )}
                  <Button
                    type="button"
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => setShowCancel(true)}
                  >
                    Cancel Transaction
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Quick info card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">Quick Info</p>
            <dl className="space-y-3">
              <InfoRow label="Transaction Date">
                {new Date(tx.transactionDate ?? tx.createdAt).toLocaleDateString()}
              </InfoRow>
              <InfoRow label="Branch">{tx.receivingPoint?.name || '—'}</InfoRow>
              <InfoRow label="Created By">{tx.createdBy?.firstName} {tx.createdBy?.lastName}</InfoRow>
            </dl>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && (
        <TransactionReceipt transaction={tx} onClose={() => setShowReceipt(false)} />
      )}

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Edit ${tx.transactionCode}`} size="md">
        <div className="space-y-3">
          {editError && <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{editError}</div>}
          {tx.syncedToReceiving && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
              This transaction has already been synced and cannot be changed from the sender portal.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CAD Amount</label>
              <input type="number" step="0.01" min="0" value={editForm.cadAmount} onChange={(e) => setEditForm({ ...editForm, cadAmount: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid (CAD)</label>
              <input type="number" step="0.01" min="0" value={editForm.amountPaidCAD} onChange={(e) => setEditForm({ ...editForm, amountPaidCAD: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Receiving Mode</label>
            <select value={editForm.receivingMode} onChange={(e) => setEditForm({ ...editForm, receivingMode: e.target.value as 'CASH' | 'BANK' | 'MOMO', bankName: '', bankAccountNo: '', bankAccountName: '', bankBranch: '', momoNumber: '', momoName: '' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
              <option value="CASH">Cash</option>
              <option value="BANK">Bank Transfer</option>
              <option value="MOMO">Mobile Money</option>
            </select>
          </div>
          {editForm.receivingMode === 'BANK' && (
            <div className="space-y-2 pt-1 border-t border-gray-100">
                  <input type="text" placeholder="Bank Name *" value={editForm.bankName} onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
                  <input type="text" placeholder="Account Number * (min 6 digits)" value={editForm.bankAccountNo} onChange={(e) => setEditForm({ ...editForm, bankAccountNo: e.target.value })} minLength={6} maxLength={20} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
                  <input type="text" placeholder="Account Name *" value={editForm.bankAccountName} onChange={(e) => setEditForm({ ...editForm, bankAccountName: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
                  <input type="text" placeholder="Bank Branch *" value={editForm.bankBranch} onChange={(e) => setEditForm({ ...editForm, bankBranch: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
                </div>
              )}
          {editForm.receivingMode === 'MOMO' && (
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <input type="tel" placeholder="Mobile Money Number * e.g. 0551234567" value={editForm.momoNumber} onChange={(e) => setEditForm({ ...editForm, momoNumber: e.target.value })} minLength={9} maxLength={15} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
              <input type="text" placeholder="Name on Number" value={editForm.momoName} onChange={(e) => setEditForm({ ...editForm, momoName: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input type="text" placeholder="Optional…" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button type="button" onClick={submitEdit} isLoading={editLoading}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Collect Remaining Modal */}
      <Modal isOpen={showCollect} onClose={() => setShowCollect(false)} title="Collect Remaining Balance" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-sm text-orange-900 font-semibold">{tx.transactionCode}</p>
            <p className="text-lg font-bold text-orange-800 mt-1">Remaining: {fmtCAD(Number(tx.amountPendingCAD))}</p>
          </div>
          {collectMsg && <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{collectMsg}</div>}
          <Select
            id="collect-method"
            label="Payment Method"
            value={collectMethod}
            onChange={(e) => setCollectMethod(e.target.value)}
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'E_TRANSFER', label: 'E-Transfer' },
              { value: 'SPLIT', label: 'Split' },
            ]}
          />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowCollect(false)}>Cancel</Button>
            <Button type="button" onClick={handleCollect} isLoading={collectLoading}>Collect Payment</Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Confirm Modal */}
      <Modal isOpen={showCancel} onClose={() => setShowCancel(false)} title="Cancel Transaction" size="sm">
        <div>
          <p className="text-sm text-gray-700 mb-1">Are you sure you want to cancel <span className="font-mono font-semibold text-blue-700">{tx.transactionCode}</span>?</p>
          <p className="text-xs text-gray-500 mb-5">This will set the status to Cancelled and cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setShowCancel(false)}>No, keep it</Button>
            <Button type="button" onClick={handleCancel} isLoading={cancelLoading} className="bg-red-600 hover:bg-red-700">Yes, cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Change to Immediate Modal */}
      <Modal isOpen={showChangeType} onClose={() => setShowChangeType(false)} title="Change to Immediate" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-sm font-semibold text-orange-900">{tx.transactionCode}</p>
            <p className="text-xs text-orange-700 mt-0.5">Currently: <strong>Standard</strong></p>
          </div>
          <p className="text-sm text-gray-700">
            Changing this transaction to <strong>Immediate (Additional)</strong> will sync it now, fund the receiving branch immediately, and mark it for priority disbursement. This action cannot be undone.
          </p>
          {changeTypeError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{changeTypeError}</div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowChangeType(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={handleChangeToImmediate}
              isLoading={changeTypeLoading}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Confirm — Change to Immediate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
