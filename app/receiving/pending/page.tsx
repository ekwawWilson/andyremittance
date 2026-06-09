'use client';
import { useEffect, useState } from 'react';
import { apiClient, Transaction, Notification, SubPayment, TransactionReceiver, TillStatus } from '@/lib/api-client';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingServerDate } from '@/lib/hooks/useReceivingServerDate';
import { printReceipt, printMultiReceiverReceipt } from '@/lib/print-receipt';
import { exportToExcel, exportToPDF, SummaryItem } from '@/lib/utils/export';
import { fmtGHS, fmtNum } from '@/lib/utils/format';

/** Return a human-readable age string for a transaction waiting to be paid */
function txAge(createdAt: string): { label: string; urgent: boolean } {
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 2) return { label: `${days}d`, urgent: true };
  if (hours >= 4) return { label: `${hours}h`, urgent: true };
  if (hours >= 1) return { label: `${hours}h ${mins % 60}m`, urgent: false };
  return { label: `${mins}m`, urgent: false };
}

// Multi-receiver allocation row (teller-entered for deferred, or display-only for pre-assigned)
interface AllocationRow {
  id: string; // local key
  receiverId?: string;
  receiverName: string;
  receiverPhone: string;
  ghsAmount: string;
  notes: string;
}

interface PaymentDetailsState {
  receivingMode: 'CASH' | 'BANK' | 'MOMO';
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  cashPhoneNumber: string;
  cashGhanaCardNumber: string;
  momoNumber: string;
  momoName: string;
  receiverName: string;
  receiverPhone: string;
}

function latestSubPayment(t?: Transaction | null) {
  return t?.subPayments?.[0];
}

function disbursedAmount(t?: Transaction | null) {
  return (t?.subPayments ?? []).reduce((sum, sp) => sum + Number(sp.ghsAmount), 0);
}

function outstandingAmount(t?: Transaction | null) {
  if (!t) return 0;
  return Math.max(0, Number(t.ghsAmount) - disbursedAmount(t));
}

function pendingAmount(t?: Transaction | null) {
  if (!t) return 0;
  return t.status === 'PARTIAL_PAYMENT' ? outstandingAmount(t) : Number(t.ghsAmount);
}

function buildPaymentDetailsState(t?: Transaction | null): PaymentDetailsState {
  const latest = latestSubPayment(t);
  return {
    receivingMode: (latest?.receivingMode as PaymentDetailsState['receivingMode']) ?? t?.receivingMode ?? 'CASH',
    bankName: latest?.bankName ?? t?.bankName ?? '',
    bankAccountNo: latest?.bankAccountNo ?? t?.bankAccountNo ?? '',
    bankAccountName: latest?.bankAccountName ?? t?.bankAccountName ?? '',
    cashPhoneNumber: latest?.cashPhoneNumber ?? t?.cashPhoneNumber ?? t?.receiver?.phone ?? '',
    cashGhanaCardNumber: latest?.cashGhanaCardNumber ?? t?.cashGhanaCardNumber ?? '',
    momoNumber: latest?.momoNumber ?? t?.momoNumber ?? '',
    momoName: latest?.momoName ?? t?.momoName ?? '',
    receiverName: latest?.receiverName ?? `${t?.receiver?.firstName ?? ''} ${t?.receiver?.lastName ?? ''}`.trim(),
    receiverPhone: latest?.receiverPhone ?? t?.receiver?.phone ?? '',
  };
}

// Group transactions by branch name
function groupByBranch(txs: Transaction[]): Array<{ branchName: string; branchId: string; transactions: Transaction[] }> {
  const map = new Map<string, { branchName: string; branchId: string; transactions: Transaction[] }>();
  for (const t of txs) {
    const id = t.receivingPointId;
    const name = t.receivingPoint?.name ?? 'Unknown Branch';
    if (!map.has(id)) map.set(id, { branchName: name, branchId: id, transactions: [] });
    map.get(id)!.transactions.push(t);
  }
  return Array.from(map.values()).sort((a, b) => a.branchName.localeCompare(b.branchName));
}

function getTransactionCodePrefix(code: string): string {
  const lastDash = code.lastIndexOf('-');
  return lastDash >= 0 ? code.slice(0, lastDash) : code;
}

function getSharedValue(values: string[]): string | null {
  const unique = Array.from(new Set(values.filter(Boolean)));
  return unique.length === 1 ? unique[0] : null;
}

const pendingExportHeaders = [
  'Code',
  'Sender',
  'Receiver',
  'GHS Amount',
  'Mode',
  'Bank Name',
  'Account No.',
  'Account Name',
  'MoMo Number',
  'MoMo Name',
];

function buildPendingExportRow(t: Transaction) {
  const latest = latestSubPayment(t);
  const payment = buildPaymentDetailsState(t);
  const mode = payment.receivingMode;

  return {
    code: t.transactionCode,
    sender: `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.trim(),
    receiver: payment.receiverName || `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim() || '—',
    amount: pendingAmount(t),
    mode,
    bankName: mode === 'BANK' ? payment.bankName : '',
    bankAccountNo: mode === 'BANK' ? payment.bankAccountNo : '',
    bankAccountName: mode === 'BANK' ? payment.bankAccountName : '',
    momoNumber: mode === 'MOMO' ? payment.momoNumber : '',
    momoName: mode === 'MOMO' ? payment.momoName : '',
  };
}

function buildPendingExportSummary(txs: Transaction[]): SummaryItem[] {
  const totalAmount = txs.reduce((sum, t) => sum + pendingAmount(t), 0);
  const modeTotals = txs.reduce(
    (acc, t) => {
      acc[t.receivingMode] += pendingAmount(t);
      return acc;
    },
    { CASH: 0, BANK: 0, MOMO: 0 }
  );

  const sharedCodePrefix = getSharedValue(txs.map((t) => getTransactionCodePrefix(t.transactionCode)));
  const branchNames = txs.map((t) => t.receivingPoint?.name ?? 'Unknown Branch');
  const sharedBranch = getSharedValue(branchNames);
  const branchCount = new Set(branchNames).size;

  const summary: SummaryItem[] = [
    { label: 'Transactions', value: String(txs.length) },
    { label: 'Total Amount', value: fmtGHS(totalAmount), highlight: 'green' },
    {
      label: 'Branch',
      value: sharedBranch ?? (branchCount > 1 ? `Multiple branches (${branchCount})` : 'Unknown Branch'),
      highlight: 'purple',
    },
    { label: 'Cash Total', value: fmtGHS(modeTotals.CASH), highlight: 'green' },
    { label: 'Bank Total', value: fmtGHS(modeTotals.BANK), highlight: 'blue' },
    { label: 'MoMo Total', value: fmtGHS(modeTotals.MOMO), highlight: 'purple' },
  ];

  if (sharedCodePrefix) {
    summary.splice(1, 0, { label: 'Code Prefix', value: sharedCodePrefix, highlight: 'blue' });
  }

  return summary;
}

export default function PendingPaymentsPage() {
  const { user } = useAuth();
  const { serverDate, loading: serverDateLoading } = useReceivingServerDate();
  const isTeller = user?.role === 'TELLER';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Till float context — tellers need to know their balance before disbursing
  const [tillStatus, setTillStatus] = useState<TillStatus | null>(null);

  const [verifyTx, setVerifyTx] = useState<Transaction | null>(null);
  const [idConfirmed, setIdConfirmed] = useState(false);
  const [payForm, setPayForm] = useState<PaymentDetailsState>(buildPaymentDetailsState());

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null);

  const [subPayTx, setSubPayTx] = useState<Transaction | null>(null);
  const [subPayments, setSubPayments] = useState<SubPayment[]>([]);
  const [subPayAmount, setSubPayAmount] = useState('');
  const [subPayNotes, setSubPayNotes] = useState('');
  const [subPayForm, setSubPayForm] = useState<PaymentDetailsState>(buildPaymentDetailsState());
  const [subPayLoading, setSubPayLoading] = useState(false);
  const [subPayError, setSubPayError] = useState('');
  const [subPayRemaining, setSubPayRemaining] = useState(0);

  // Collapsed state per branch id
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Multi-receiver disbursement modal
  const [multiTx, setMultiTx] = useState<Transaction | null>(null);
  const [multiAllocations, setMultiAllocations] = useState<AllocationRow[]>([]);
  const [multiError, setMultiError] = useState('');
  const [multiSubmitting, setMultiSubmitting] = useState(false);
  const [multiIdConfirmed, setMultiIdConfirmed] = useState(false);

  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [codeTypeFilter, setCodeTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Initialise date filters once server date loads
  useEffect(() => {
    if (serverDateLoading || dateFrom) return;
    setDateFrom(serverDate);
    setDateTo(serverDate);
  }, [serverDate, serverDateLoading]);

  const fetchPending = async () => {
    setIsLoading(true);
    // If the user has no receiving point (e.g. SUPER_ADMIN), fetch all branches
    const [txRes, tillRes] = await Promise.all([
      apiClient.getTransactions({
        status: 'SYNCED,PARTIAL_PAYMENT',
        receivingPointId: user?.receivingPoint?.id || undefined,
        startDate: dateFrom || undefined,
        endDate: dateTo || undefined,
        limit: 200,
      }),
      isTeller ? apiClient.getTillStatus() : Promise.resolve(null),
    ]);
    if (txRes.success && txRes.data) setTransactions(txRes.data.transactions);
    if (tillRes && tillRes.success && tillRes.data) setTillStatus(tillRes.data);
    setIsLoading(false);
  };

  const fetchNotifications = async () => {
    const res = await apiClient.getNotifications();
    if (res.success && res.data) setNotifications(res.data.notifications);
  };

  const dismissNotification = async (id: string) => {
    await apiClient.markNotificationRead(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  useEffect(() => {
    if (user) { fetchPending(); fetchNotifications(); }
  }, [user, dateFrom, dateTo]);

  // Poll notifications every 30 seconds so tellers see new arrivals without a manual refresh.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  const handlePay = async (id: string) => {
    // Client-side validation before hitting the API
    if (payForm.receivingMode === 'BANK') {
      if (!payForm.bankName.trim()) { setError('Bank name is required for bank payments'); return; }
      if (!payForm.bankAccountNo.trim()) { setError('Account number is required for bank payments'); return; }
      if (!payForm.bankAccountName.trim()) { setError('Account name is required for bank payments'); return; }
    }
    if (payForm.receivingMode === 'CASH') {
      if (!payForm.cashGhanaCardNumber.trim()) { setError('Ghana Card number is required for cash payments'); return; }
      if (!payForm.cashPhoneNumber.trim()) { setError('Phone number is required for cash payments'); return; }
    }
    if (payForm.receivingMode === 'MOMO') {
      if (!payForm.momoNumber.trim()) { setError('MoMo number is required'); return; }
      if (!payForm.momoName.trim()) { setError('MoMo account name is required'); return; }
    }
    setPayingId(id);
    setError('');
    const txSnapshot = verifyTx;
    const res = await apiClient.markTransactionPaid(id, {
      receivingMode: payForm.receivingMode,
      bankName: payForm.bankName || undefined,
      bankAccountNo: payForm.bankAccountNo || undefined,
      bankAccountName: payForm.bankAccountName || undefined,
      cashPhoneNumber: payForm.cashPhoneNumber || undefined,
      cashGhanaCardNumber: payForm.cashGhanaCardNumber || undefined,
      momoNumber: payForm.momoNumber || undefined,
      momoName: payForm.momoName || undefined,
    });
    if (res.success) {
      // Remove immediately from list — don't wait for refetch
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setVerifyTx(null);
      setIdConfirmed(false);
      const paidTx = res.data ?? txSnapshot;
      if (paidTx && (res.data?.receivingMode ?? payForm.receivingMode) === 'CASH') {
        printReceipt(paidTx, paidTx.receivingPoint?.name ?? user?.receivingPoint?.name ?? 'Branch', {
          receivingMode: 'CASH',
          amountPaidGHS: txSnapshot?.status === 'PARTIAL_PAYMENT'
            ? Number(paidTx.ghsAmount) - disbursedAmount(paidTx)  // outstanding at time of final call
            : Number(paidTx.ghsAmount),
          cashPhoneNumber: payForm.cashPhoneNumber,
          cashGhanaCardNumber: payForm.cashGhanaCardNumber,
        });
      }
      // Background refresh to sync any other changes
      fetchPending();
    } else {
      setError(res.error || 'Failed');
    }
    setPayingId(null);
  };

  const handleBulkDisburse = async () => {
    setBulkSubmitting(true);
    const res = await apiClient.bulkDisburse(Array.from(selected));
    if (res.success && res.data) {
      setBulkResult({ succeeded: res.data.succeeded, failed: res.data.failed });
      setSelected(new Set());
      fetchPending();
    }
    setBulkSubmitting(false);
    setBulkConfirmOpen(false);
    setBulkConfirmed(false);
  };

  const openSubPay = async (t: Transaction) => {
    setSubPayTx(t);
    setSubPayAmount('');
    setSubPayNotes('');
    setSubPayError('');
    setSubPayForm(buildPaymentDetailsState(t));
    setSubPayLoading(true);
    const res = await apiClient.getSubPayments(t.id);
    if (res.success && res.data) {
      setSubPayments(res.data.subPayments);
      setSubPayRemaining(res.data.remaining);
    } else {
      setSubPayments([]);
      setSubPayRemaining(pendingAmount(t));
    }
    setSubPayLoading(false);
  };

  const handleSubPay = async () => {
    if (!subPayTx) return;
    const amt = parseFloat(subPayAmount);
    if (!amt || amt <= 0) { setSubPayError('Enter a valid amount'); return; }
    if (!subPayForm.receiverName.trim()) { setSubPayError('Receiver name is required'); return; }
    if (!subPayForm.receiverPhone.trim()) { setSubPayError('Receiver phone number is required'); return; }
    if (subPayForm.receivingMode === 'BANK') {
      if (!subPayForm.bankName.trim()) { setSubPayError('Bank name is required for bank payments'); return; }
      if (!subPayForm.bankAccountNo.trim()) { setSubPayError('Account number is required for bank payments'); return; }
      if (!subPayForm.bankAccountName.trim()) { setSubPayError('Account name is required for bank payments'); return; }
    }
    if (subPayForm.receivingMode === 'CASH') {
      if (!subPayForm.cashGhanaCardNumber.trim()) { setSubPayError('Ghana Card number is required for cash payments'); return; }
      if (!subPayForm.cashPhoneNumber.trim()) { setSubPayError('Phone number is required for cash payments'); return; }
    }
    if (subPayForm.receivingMode === 'MOMO') {
      if (!subPayForm.momoNumber.trim()) { setSubPayError('MoMo number is required'); return; }
      if (!subPayForm.momoName.trim()) { setSubPayError('MoMo account name is required'); return; }
    }
    setSubPayError('');
    setSubPayLoading(true);
    const res = await apiClient.createSubPayment(subPayTx.id, {
      ghsAmount: amt,
      notes: subPayNotes || undefined,
      receiverName: subPayForm.receiverName,
      receiverPhone: subPayForm.receiverPhone,
      receivingMode: subPayForm.receivingMode,
      bankName: subPayForm.bankName || undefined,
      bankAccountNo: subPayForm.bankAccountNo || undefined,
      bankAccountName: subPayForm.bankAccountName || undefined,
      cashPhoneNumber: subPayForm.cashPhoneNumber || undefined,
      cashGhanaCardNumber: subPayForm.cashGhanaCardNumber || undefined,
      momoNumber: subPayForm.momoNumber || undefined,
      momoName: subPayForm.momoName || undefined,
    });
    if (res.success && res.data) {
      setSubPayRemaining(res.data.remaining);
      setSubPayAmount('');
      setSubPayNotes('');
      const listRes = await apiClient.getSubPayments(subPayTx.id);
      if (listRes.success && listRes.data) setSubPayments(listRes.data.subPayments);
      if (subPayForm.receivingMode === 'CASH') {
        printReceipt(subPayTx, subPayTx.receivingPoint?.name ?? user?.receivingPoint?.name ?? 'Branch', {
          title: 'PARTIAL PAYMENT RECEIPT',
          amountLabel: 'AMOUNT PAID NOW',
          amountPaidGHS: amt,
          receiverName: subPayForm.receiverName,
          receiverPhone: subPayForm.receiverPhone,
          receivingMode: 'CASH',
          cashPhoneNumber: subPayForm.cashPhoneNumber,
          cashGhanaCardNumber: subPayForm.cashGhanaCardNumber,
          notes: subPayNotes || undefined,
        });
      }
      if (res.data.isFullyPaid) { setSubPayTx(null); fetchPending(); }
    } else {
      setSubPayError(res.error || 'Failed');
    }
    setSubPayLoading(false);
  };

  // ── Multi-receiver helpers ──────────────────────────────────────────────────

  const openMultiDisburse = (t: Transaction) => {
    setMultiTx(t);
    setMultiError('');
    setMultiIdConfirmed(false);

    if (t.receiversDeferred) {
      // Start with one blank allocation row
      setMultiAllocations([{ id: crypto.randomUUID(), receiverName: '', receiverPhone: '', ghsAmount: '', notes: '' }]);
    } else {
      // Pre-assigned — map existing TransactionReceiver rows
      const rows: AllocationRow[] = (t.transactionReceivers ?? []).map((tr: TransactionReceiver) => ({
        id: tr.id,
        receiverId: tr.receiverId,
        receiverName: tr.receiver ? `${tr.receiver.firstName} ${tr.receiver.lastName}` : (tr.receiverName ?? ''),
        receiverPhone: tr.receiver?.phone ?? tr.receiverPhone ?? '',
        ghsAmount: String(Number(tr.ghsAmount).toFixed(2)),
        notes: tr.notes ?? '',
      }));
      setMultiAllocations(rows);
    }
  };

  const addAllocationRow = () => {
    setMultiAllocations((prev) => [
      ...prev,
      { id: crypto.randomUUID(), receiverName: '', receiverPhone: '', ghsAmount: '', notes: '' },
    ]);
  };

  const removeAllocationRow = (id: string) => {
    setMultiAllocations((prev) => prev.filter((r) => r.id !== id));
  };

  const updateAllocationRow = (id: string, field: keyof AllocationRow, value: string) => {
    setMultiAllocations((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleMultiDisburse = async () => {
    if (!multiTx) return;
    setMultiError('');

    // Validate
    for (const row of multiAllocations) {
      if (!row.receiverName.trim()) { setMultiError('All allocations must have a receiver name'); return; }
      if (!row.receiverPhone.trim()) { setMultiError('All allocations must have a receiver phone'); return; }
      const amt = parseFloat(row.ghsAmount);
      if (!amt || amt <= 0) { setMultiError('All allocations must have a positive GHS amount'); return; }
    }

    const total = multiAllocations.reduce((s, r) => s + parseFloat(r.ghsAmount || '0'), 0);
    const txGhs = Number(multiTx.ghsAmount);
    if (total > txGhs + 0.01) {
      setMultiError(`Allocated ${fmtGHS(total)} exceeds transaction total ${fmtGHS(txGhs)}`);
      return;
    }
    if (total < txGhs - 0.01) {
      setMultiError(`Allocated ${fmtGHS(total)} is less than transaction total ${fmtGHS(txGhs)}. All funds must be allocated.`);
      return;
    }

    setMultiSubmitting(true);
    const allocations = multiAllocations.map((r) => ({
      receiverId: r.receiverId,
      receiverName: r.receiverName.trim(),
      receiverPhone: r.receiverPhone.trim(),
      ghsAmount: parseFloat(r.ghsAmount),
      notes: r.notes.trim() || undefined,
    }));

    const txSnapshot = multiTx;
    const res = await apiClient.disburseMultiReceiver(multiTx.id, allocations);
    if (res.success) {
      setMultiTx(null);
      fetchPending();
      printMultiReceiverReceipt(
        res.data ?? txSnapshot,
        txSnapshot.receivingPoint?.name ?? user?.receivingPoint?.name ?? 'Branch',
        allocations.map((a) => ({
          receiverName: a.receiverName ?? '',
          receiverPhone: a.receiverPhone ?? '',
          ghsAmount: a.ghsAmount,
          notes: a.notes,
        }))
      );
    } else {
      setMultiError(res.error || 'Failed to disburse');
    }
    setMultiSubmitting(false);
  };

  const handleExportPdf = () => {
    const summary = buildPendingExportSummary(filtered);
    const rows = filtered.map((t) => {
      const row = buildPendingExportRow(t);
      return [
        row.code,
        row.sender,
        row.receiver,
        fmtGHS(row.amount),
        row.mode,
        row.bankName || '—',
        row.bankAccountNo || '—',
        row.bankAccountName || '—',
        row.momoNumber || '—',
        row.momoName || '—',
      ];
    });

    exportToPDF(
      'Pending Payments',
      pendingExportHeaders,
      rows,
      `Period: ${dateFrom}${dateTo !== dateFrom ? ` to ${dateTo}` : ''}`,
      summary
    );
  };

  const handleExportExcel = async () => {
    const summary = buildPendingExportSummary(filtered);
    const rows = filtered.map((t) => {
      const row = buildPendingExportRow(t);
      return [
        row.code,
        row.sender,
        row.receiver,
        fmtNum(row.amount),
        row.mode,
        row.bankName,
        row.bankAccountNo,
        row.bankAccountName,
        row.momoNumber,
        row.momoName,
      ];
    });

    await exportToExcel(
      'Pending Payments',
      pendingExportHeaders,
      rows,
      `pending-payments-${dateFrom}${dateTo !== dateFrom ? `-to-${dateTo}` : ''}`,
      summary
    );
  };

  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      t.transactionCode.toLowerCase().includes(q) ||
      `${t.receiver?.firstName} ${t.receiver?.lastName}`.toLowerCase().includes(q) ||
      `${t.sender?.firstName} ${t.sender?.lastName}`.toLowerCase().includes(q) ||
      (t.receiver?.phone || '').includes(q)
    );
    const matchMode = !modeFilter || t.receivingMode === modeFilter;
    const matchCodeType = !codeTypeFilter || t.codeType === codeTypeFilter;
    return matchSearch && matchMode && matchCodeType;
  });

  // Multi-receiver transactions cannot be bulk-disbursed — exclude from checkbox selection
  const isBulkEligible = (t: Transaction) =>
    t.status === 'SYNCED' && !t.receiversDeferred && !(t.transactionReceivers && t.transactionReceivers.length > 0);

  const grouped = groupByBranch(filtered);
  const eligibleFiltered = filtered.filter(isBulkEligible);
  const allFilteredSelected = eligibleFiltered.length > 0 && eligibleFiltered.every((t) => selected.has(t.id));

  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => { const next = new Set(prev); eligibleFiltered.forEach((t) => next.delete(t.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); eligibleFiltered.forEach((t) => next.add(t.id)); return next; });
    }
  };

  const toggleBranch = (branchId: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(branchId)) next.delete(branchId); else next.add(branchId);
    return next;
  });

  const toggleSelectBranch = (txs: Transaction[]) => {
    const eligible = txs.filter(isBulkEligible);
    const allSelected = eligible.every((t) => selected.has(t.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) eligible.forEach((t) => next.delete(t.id));
      else eligible.forEach((t) => next.add(t.id));
      return next;
    });
  };

  const inputCls = 'px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow';
  const totalGHS = transactions.reduce((s, t) => s + pendingAmount(t), 0);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Pending Payments</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-sm text-gray-400">
              {transactions.length} pending{filtered.length !== transactions.length ? ` · ${filtered.length} shown` : ''}
              {transactions.length > 0 && ` · ${fmtGHS(totalGHS)} total`}
              {grouped.length > 1 && ` · ${grouped.length} branches`}
            </p>
            {!serverDateLoading && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700">
                <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(serverDate + 'T12:00:00').toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button variant="secondary" onClick={handleExportPdf} disabled={filtered.length === 0}>
            <svg className="w-4 h-4 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
          <Button variant="secondary" onClick={() => void handleExportExcel()} disabled={filtered.length === 0}>
            <svg className="w-4 h-4 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M7 4v16m10-16v16M4 17h16" />
            </svg>
            <span className="hidden sm:inline">Export Excel</span>
          </Button>
          {isTeller && selected.size > 0 && (
            <Button onClick={() => { setBulkConfirmOpen(true); setBulkConfirmed(false); }} className="bg-emerald-600 hover:bg-emerald-700">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Bulk Disburse ({selected.size})
            </Button>
          )}
        </div>
      </div>

      {/* Till float context — tellers only */}
      {isTeller && tillStatus && (
        (() => {
          const bal = tillStatus.balance;
          const totalPending = transactions
            .filter((t) => t.codeType !== 'ADDITIONAL')
            .reduce((s, t) => s + pendingAmount(t), 0);
          const isCritical = bal < 200;
          const isLow = bal >= 200 && bal < 500;
          const insufficient = bal < totalPending && totalPending > 0;
          if (isCritical || isLow || insufficient) {
            const bg = isCritical ? 'bg-red-50 border-red-300' : insufficient ? 'bg-amber-50 border-amber-300' : 'bg-amber-50 border-amber-200';
            const text = isCritical ? 'text-red-800' : 'text-amber-800';
            const icon = isCritical ? 'text-red-600' : 'text-amber-600';
            return (
              <div className={`flex items-start gap-3 p-3.5 ${bg} border rounded-xl`}>
                <svg className={`w-5 h-5 ${icon} shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div className={`text-sm ${text}`}>
                  <span className="font-bold">
                    {isCritical ? 'Critical Float: ' : insufficient ? 'Insufficient Float: ' : 'Low Float: '}
                  </span>
                  Till balance is <strong>GHS {bal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</strong>
                  {insufficient && totalPending > 0 && ` — pending total is GHS ${totalPending.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`}.
                  {' '}Request a vault top-up before disbursing.
                </div>
              </div>
            );
          }
          return (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-sm text-emerald-700">
                Till balance: <strong>GHS {bal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</strong>
                {tillStatus.todayReconciliation && (
                  <span className="ml-3 text-xs text-emerald-600">
                    · Reconciliation: <strong className={tillStatus.todayReconciliation.status === 'APPROVED' || tillStatus.todayReconciliation.status === 'COMPLETED' ? 'text-emerald-700' : tillStatus.todayReconciliation.status === 'REJECTED' ? 'text-red-600' : 'text-amber-700'}>{tillStatus.todayReconciliation.status}</strong>
                  </span>
                )}
              </span>
            </div>
          );
        })()
      )}

      {/* Error */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          {error}
        </div>
      )}

      {/* Bulk result */}
      {bulkResult && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>{bulkResult.succeeded} disbursed{bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ' successfully'}.</span>
          </div>
          <button onClick={() => setBulkResult(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium underline">Dismiss</button>
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">Immediate transfer arrived</p>
                <p className="text-sm text-amber-700 mt-0.5">{n.message}</p>
              </div>
              <button onClick={() => dismissNotification(n.id)} className="text-amber-400 hover:text-amber-700 p-1 rounded-lg hover:bg-amber-100 transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col gap-3">
          {/* Search — full width */}
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by code, name, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
            />
          </div>

          {/* Filters row — wraps on mobile */}
          <div className="flex gap-2 flex-wrap items-center">
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}
              className={`${inputCls} bg-white flex-1 min-w-28`}>
              <option value="">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="MOMO">MoMo</option>
            </select>

            <select value={codeTypeFilter} onChange={(e) => setCodeTypeFilter(e.target.value)}
              className={`${inputCls} bg-white flex-1 min-w-28`}>
              <option value="">All Types</option>
              <option value="STANDARD">Standard</option>
              <option value="ADDITIONAL">Additional</option>
            </select>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-medium text-gray-400 whitespace-nowrap">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
              <label className="text-xs font-medium text-gray-400 whitespace-nowrap">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
            </div>

            {(search || modeFilter || codeTypeFilter || dateFrom !== serverDate || dateTo !== serverDate) && (
              <button
                onClick={() => { setSearch(''); setModeFilter(''); setCodeTypeFilter(''); setDateFrom(serverDate); setDateTo(serverDate); }}
                className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors whitespace-nowrap flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-emerald-600 border-t-transparent"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-20">
          {transactions.length > 0 ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <p className="text-gray-500 font-medium">No results match your filters</p>
              <button onClick={() => { setSearch(''); setModeFilter(''); setCodeTypeFilter(''); }} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">Clear filters</button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-gray-700 font-semibold">All caught up!</p>
              <p className="text-gray-400 text-sm mt-1">No pending payments at this time.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Global select-all row when multiple branches — tellers only */}
          {isTeller && grouped.length > 1 && (
            <div className="flex items-center gap-3 px-1">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-xs font-medium text-gray-500">Select all {filtered.length} transactions across all branches</span>
            </div>
          )}

          {grouped.map(({ branchName, branchId, transactions: branchTxs }) => {
            const isCollapsed = collapsed.has(branchId);
            const branchTotal = branchTxs.reduce((s, t) => s + pendingAmount(t), 0);
            const eligibleBranchTxs = branchTxs.filter(isBulkEligible);
            const allBranchSelected = eligibleBranchTxs.length > 0 && eligibleBranchTxs.every((t) => selected.has(t.id));
            const someBranchSelected = eligibleBranchTxs.some((t) => selected.has(t.id));

            return (
              <div key={branchId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Branch header */}
                <button
                  onClick={() => toggleBranch(branchId)}
                  className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50/80 border-b border-gray-100 hover:bg-gray-100/60 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{branchName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {branchTxs.length} transaction{branchTxs.length !== 1 ? 's' : ''} · GHS {branchTotal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Branch select-all checkbox — tellers only */}
                    {isTeller && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={allBranchSelected}
                          ref={(el) => { if (el) el.indeterminate = !allBranchSelected && someBranchSelected; }}
                          onChange={() => toggleSelectBranch(branchTxs)}
                          className="w-4 h-4 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </div>
                    )}
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Branch transactions — mobile cards + desktop table */}
                {!isCollapsed && (
                  <>
                    {/* ── Mobile card list (hidden sm+) ─────────────────────── */}
                    <div className="sm:hidden divide-y divide-gray-100">
                      {branchTxs.map((t) => {
                        const age = txAge(t.createdAt);
                        const isMulti = t.receiversDeferred || (t.transactionReceivers && t.transactionReceivers.length > 0);
                        return (
                          <div key={t.id} className={`px-4 py-3.5 ${selected.has(t.id) ? 'bg-emerald-50/60' : ''}`}>
                            <div className="flex items-start gap-3">
                              {/* Checkbox */}
                              {isTeller && (
                                <div className="pt-0.5 shrink-0">
                                  {isBulkEligible(t) ? (
                                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                                      className="w-4 h-4 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                                  ) : (
                                    <span className="block w-4 h-4 rounded-md border-2 border-gray-200 bg-gray-100" />
                                  )}
                                </div>
                              )}
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="font-mono font-bold text-blue-600 text-xs">{t.transactionCode}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${age.urgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{age.label}</span>
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${t.receivingMode === 'CASH' ? 'bg-green-100 text-green-700' : t.receivingMode === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{t.receivingMode}</span>
                                  </div>
                                </div>
                                {/* Receiver */}
                                {isMulti ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 mb-1">
                                    {t.receiversDeferred ? 'Multi — assigned at branch' : `${t.transactionReceivers!.length} receivers`}
                                  </span>
                                ) : (
                                  <p className="text-sm font-semibold text-gray-800 truncate">
                                    {latestSubPayment(t)?.receiverName || `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim() || '—'}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400">From: {t.sender?.firstName} {t.sender?.lastName}</p>
                                {/* Amount */}
                                <div className="flex items-center justify-between mt-1.5">
                                  <div>
                                    <span className="font-bold text-emerald-700">{fmtGHS(Number(t.ghsAmount))}</span>
                                    {t.status === 'PARTIAL_PAYMENT' && (
                                      <span className="ml-2 text-[11px] text-amber-700 font-medium">
                                        Outstanding: {fmtGHS(outstandingAmount(t))}
                                      </span>
                                    )}
                                  </div>
                                  {/* Action buttons */}
                                  {isTeller && (
                                    <div className="flex gap-1.5 shrink-0">
                                      {isMulti ? (
                                        <button
                                          onClick={() => openMultiDisburse(t)}
                                          className="text-xs px-3 py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 font-semibold transition-colors"
                                        >
                                          Multi-Disburse
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => { setVerifyTx(t); setIdConfirmed(false); setPayForm(buildPaymentDetailsState(t)); }}
                                            className="text-xs px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-semibold transition-colors"
                                          >
                                            {t.status === 'PARTIAL_PAYMENT' ? 'Complete' : 'Disburse'}
                                          </button>
                                          <button
                                            onClick={() => openSubPay(t)}
                                            className="text-xs px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold transition-colors"
                                          >
                                            Partial
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Mobile branch total */}
                      <div className="px-4 py-3 bg-gray-50/60 flex justify-between text-sm">
                        <span className="font-semibold text-gray-500">{branchName} Total</span>
                        <span className="font-bold text-emerald-700">GHS {branchTotal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    {/* ── Desktop table (hidden below sm) ──────────────────── */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {isTeller && (
                              <th className="py-3 px-4 w-10">
                                <input
                                  type="checkbox"
                                  checked={allBranchSelected}
                                  ref={(el) => { if (el) el.indeterminate = !allBranchSelected && someBranchSelected; }}
                                  onChange={() => toggleSelectBranch(branchTxs)}
                                  className="w-4 h-4 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </th>
                            )}
                            <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</th>
                            <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Receiver</th>
                            <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sender</th>
                            <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">GHS Amount</th>
                            <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Mode</th>
                            <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Age</th>
                            <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {branchTxs.map((t) => (
                            <tr key={t.id} className={`transition-colors ${selected.has(t.id) ? 'bg-emerald-50/60' : 'hover:bg-gray-50/60'}`}>
                              {isTeller && (
                                <td className="py-4 px-4">
                                  {isBulkEligible(t) ? (
                                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                                      className="w-4 h-4 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                                  ) : (
                                    <span title="Multi-receiver — use Multi-Disburse" className="block w-4 h-4 rounded-md border-2 border-gray-200 bg-gray-100 cursor-not-allowed" />
                                  )}
                                </td>
                              )}
                              <td className="py-4 px-4">
                                <span className="font-mono font-bold text-blue-600 text-xs">{t.transactionCode}</span>
                              </td>
                              <td className="py-4 px-4">
                                {t.receiversDeferred ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-violet-100 text-violet-700">
                                    Multi — assigned at branch
                                  </span>
                                ) : t.transactionReceivers && t.transactionReceivers.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-violet-100 text-violet-700">
                                    {t.transactionReceivers.length} receivers
                                  </span>
                                ) : (
                                  <>
                                    <p className="font-semibold text-gray-800">
                                      {latestSubPayment(t)?.receiverName || `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim() || '—'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">{latestSubPayment(t)?.receiverPhone || t.cashPhoneNumber || t.receiver?.phone || '—'}</p>
                                    {t.status === 'PARTIAL_PAYMENT' && latestSubPayment(t)?.paidAt && (
                                      <p className="text-[11px] text-amber-700 font-medium mt-1">
                                        Partial payment made on {new Date(latestSubPayment(t)!.paidAt).toLocaleDateString('en-GH')}
                                      </p>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className="py-4 px-4 text-gray-500 text-sm">{t.sender?.firstName} {t.sender?.lastName}</td>
                              <td className="py-4 px-4">
                                <span className="font-bold text-emerald-700 text-base">{fmtGHS(Number(t.ghsAmount))}</span>
                                {t.status === 'PARTIAL_PAYMENT' && (
                                  <p className="text-[11px] text-amber-700 font-medium mt-1">
                                    Outstanding: {fmtGHS(outstandingAmount(t))}
                                  </p>
                                )}
                              </td>
                              <td className="py-4 px-4">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${t.receivingMode === 'CASH' ? 'bg-green-100 text-green-700' : t.receivingMode === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                  {t.receivingMode}
                                </span>
                                {t.receivingMode === 'BANK' && (
                                  <div className="mt-1.5 text-[11px] text-blue-700 space-y-0.5">
                                    <p>{t.bankName || '—'}</p>
                                    <p>{t.bankAccountNo || '—'}</p>
                                    <p>{t.bankAccountName || '—'}</p>
                                  </div>
                                )}
                                {t.receivingMode === 'CASH' && t.cashGhanaCardNumber && (
                                  <div className="mt-1.5 text-[11px] text-green-700 space-y-0.5">
                                    <p>Ghana Card: {t.cashGhanaCardNumber}</p>
                                    <p>Phone: {t.cashPhoneNumber || '—'}</p>
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-4">
                                {(() => {
                                  const age = txAge(t.createdAt);
                                  return (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${age.urgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                      {age.label}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="py-4 px-4">
                                {isTeller ? (
                                  <div className="flex gap-2 flex-wrap">
                                    {(t.receiversDeferred || (t.transactionReceivers && t.transactionReceivers.length > 0)) ? (
                                      <button
                                        onClick={() => openMultiDisburse(t)}
                                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 font-semibold transition-colors shadow-sm"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        Multi-Disburse
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => { setVerifyTx(t); setIdConfirmed(false); setPayForm(buildPaymentDetailsState(t)); }}
                                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-semibold transition-colors shadow-sm"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                          {t.status === 'PARTIAL_PAYMENT' ? 'Complete Payment' : 'Disburse'}
                                        </button>
                                        <button
                                          onClick={() => openSubPay(t)}
                                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold transition-colors"
                                        >
                                          {t.status === 'PARTIAL_PAYMENT' ? 'Add Partial' : 'Partial Pay'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">View only</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Branch footer totals */}
                        <tfoot>
                          <tr className="bg-gray-50/60 border-t border-gray-100">
                            <td colSpan={isTeller ? 4 : 3} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {branchName} Total
                            </td>
                            <td className="py-3 px-4 font-bold text-emerald-700 text-sm">
                              GHS {branchTotal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Grand total when multiple branches */}
          {grouped.length > 1 && (
            <div className="flex items-center justify-between px-5 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold text-gray-600">Grand Total — All Branches</span>
                <span className="text-xs text-gray-400">({filtered.length} transactions)</span>
              </div>
              <span className="text-lg font-extrabold text-emerald-700">
                GHS {totalGHS.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Identity verification modal */}
      <Modal isOpen={!!verifyTx} onClose={() => { setVerifyTx(null); setIdConfirmed(false); }} title="Verify Receiver Identity" size="sm">
        {verifyTx && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-600 mb-3">Confirm identity matches:</p>
              {[
                { label: 'Name', value: `${verifyTx.receiver?.firstName} ${verifyTx.receiver?.lastName}` },
                { label: 'Phone', value: verifyTx.receiver?.phone || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-semibold text-gray-900">{value}</span>
                </div>
              ))}
              {(verifyTx.receiver as Transaction['receiver'] & { idType?: string; idNumber?: string })?.idType && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ID</span>
                  <span className="font-semibold text-gray-900">
                    {(verifyTx.receiver as Transaction['receiver'] & { idType?: string; idNumber?: string }).idType}:{' '}
                    {(verifyTx.receiver as Transaction['receiver'] & { idType?: string; idNumber?: string }).idNumber}
                  </span>
                </div>
              )}
              <div className="border-t border-amber-200 pt-2 flex justify-between text-sm">
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-emerald-700 text-base">
                  {fmtGHS(verifyTx.status === 'PARTIAL_PAYMENT' ? outstandingAmount(verifyTx) : Number(verifyTx.ghsAmount))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Code</span>
                <span className="font-mono text-blue-700 text-xs">{verifyTx.transactionCode}</span>
              </div>
              {verifyTx.receivingPoint?.name && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Branch</span>
                  <span className="font-semibold text-gray-800">{verifyTx.receivingPoint.name}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-white border border-gray-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Payment Details</p>
                <TransactionStatusBadge status={verifyTx.status} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Mode</label>
                <select
                  value={payForm.receivingMode}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, receivingMode: e.target.value as PaymentDetailsState['receivingMode'] }))}
                  className={`${inputCls} w-full bg-white`}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="MOMO">MoMo</option>
                </select>
              </div>

              {payForm.receivingMode === 'BANK' && (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Bank Name</label>
                    <input value={payForm.bankName} onChange={(e) => setPayForm((prev) => ({ ...prev, bankName: e.target.value }))} className={`${inputCls} w-full`} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Account Number</label>
                    <input value={payForm.bankAccountNo} onChange={(e) => setPayForm((prev) => ({ ...prev, bankAccountNo: e.target.value }))} className={`${inputCls} w-full`} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Account Name</label>
                    <input value={payForm.bankAccountName} onChange={(e) => setPayForm((prev) => ({ ...prev, bankAccountName: e.target.value }))} className={`${inputCls} w-full`} />
                  </div>
                </div>
              )}

              {payForm.receivingMode === 'CASH' && (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghana Card Number</label>
                    <input value={payForm.cashGhanaCardNumber} onChange={(e) => setPayForm((prev) => ({ ...prev, cashGhanaCardNumber: e.target.value }))} className={`${inputCls} w-full`} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone Number</label>
                    <input value={payForm.cashPhoneNumber} onChange={(e) => setPayForm((prev) => ({ ...prev, cashPhoneNumber: e.target.value }))} className={`${inputCls} w-full`} />
                  </div>
                </div>
              )}

              {payForm.receivingMode === 'MOMO' && (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">MoMo Number</label>
                    <input value={payForm.momoNumber} onChange={(e) => setPayForm((prev) => ({ ...prev, momoNumber: e.target.value }))} className={`${inputCls} w-full`} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">MoMo Account Name</label>
                    <input value={payForm.momoName} onChange={(e) => setPayForm((prev) => ({ ...prev, momoName: e.target.value }))} className={`${inputCls} w-full`} />
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={idConfirmed}
                onChange={(e) => setIdConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700">
                I confirm the receiver&apos;s identity matches the details above and they have presented valid ID.
              </span>
            </label>

            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setVerifyTx(null); setIdConfirmed(false); }}>Cancel</Button>
              <Button onClick={() => handlePay(verifyTx.id)} isLoading={payingId === verifyTx.id} disabled={!idConfirmed}
                className="bg-emerald-600 hover:bg-emerald-700">
                Confirm & Disburse
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Sub-payment modal */}
      <Modal isOpen={!!subPayTx} onClose={() => setSubPayTx(null)} title={`Partial Payment — ${subPayTx?.transactionCode}`} size="sm">
        {subPayTx && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm flex justify-between font-medium">
              <span className="text-gray-500">Total Amount</span>
              <span className="font-bold text-gray-800">{fmtGHS(Number(subPayTx.ghsAmount))}</span>
            </div>

            {subPayments.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">#</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">Receiver</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-semibold">GHS</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">Mode</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">By</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {subPayments.map((sp, i) => (
                      <tr key={sp.id}>
                        <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                        <td className="py-2 px-3 text-gray-600">
                          <p>{sp.receiverName || '—'}</p>
                          <p className="text-[11px] text-gray-400">{sp.receiverPhone || '—'}</p>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-700">{fmtGHS(Number(sp.ghsAmount))}</td>
                        <td className="py-2 px-3 text-gray-500">{sp.receivingMode || '—'}</td>
                        <td className="py-2 px-3 text-gray-600">{sp.paidByName}</td>
                        <td className="py-2 px-3 text-gray-400">{new Date(sp.paidAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className={`p-3 rounded-xl border text-sm flex justify-between font-semibold ${subPayRemaining <= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              <span>Remaining</span>
              <span>{fmtGHS(subPayRemaining)}</span>
            </div>

            {subPayRemaining > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Receiver Name</label>
                    <input
                      type="text"
                      value={subPayForm.receiverName}
                      onChange={(e) => setSubPayForm((prev) => ({ ...prev, receiverName: e.target.value }))}
                      placeholder="Receiver full name"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Receiver Phone Number</label>
                    <input
                      type="text"
                      value={subPayForm.receiverPhone}
                      onChange={(e) => setSubPayForm((prev) => ({ ...prev, receiverPhone: e.target.value }))}
                      placeholder="+233 XX XXX XXXX"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Mode</label>
                    <select
                      value={subPayForm.receivingMode}
                      onChange={(e) => setSubPayForm((prev) => ({ ...prev, receivingMode: e.target.value as PaymentDetailsState['receivingMode'] }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow bg-white"
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK">Bank</option>
                      <option value="MOMO">MoMo</option>
                    </select>
                  </div>
                </div>

                {subPayForm.receivingMode === 'BANK' && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Bank Name</label>
                      <input
                        type="text"
                        value={subPayForm.bankName}
                        onChange={(e) => setSubPayForm((prev) => ({ ...prev, bankName: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Account Number</label>
                      <input
                        type="text"
                        value={subPayForm.bankAccountNo}
                        onChange={(e) => setSubPayForm((prev) => ({ ...prev, bankAccountNo: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Account Name</label>
                      <input
                        type="text"
                        value={subPayForm.bankAccountName}
                        onChange={(e) => setSubPayForm((prev) => ({ ...prev, bankAccountName: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                      />
                    </div>
                  </div>
                )}

                {subPayForm.receivingMode === 'CASH' && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghana Card Number</label>
                      <input
                        type="text"
                        value={subPayForm.cashGhanaCardNumber}
                        onChange={(e) => setSubPayForm((prev) => ({ ...prev, cashGhanaCardNumber: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone Number</label>
                      <input
                        type="text"
                        value={subPayForm.cashPhoneNumber}
                        onChange={(e) => setSubPayForm((prev) => ({ ...prev, cashPhoneNumber: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                      />
                    </div>
                  </div>
                )}

                {subPayForm.receivingMode === 'MOMO' && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">MoMo Number</label>
                      <input
                        type="text"
                        value={subPayForm.momoNumber}
                        onChange={(e) => setSubPayForm((prev) => ({ ...prev, momoNumber: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">MoMo Account Name</label>
                      <input
                        type="text"
                        value={subPayForm.momoName}
                        onChange={(e) => setSubPayForm((prev) => ({ ...prev, momoName: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Amount to disburse now (max {fmtGHS(subPayRemaining)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={subPayRemaining}
                    value={subPayAmount}
                    onChange={(e) => setSubPayAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes (optional)</label>
                  <input
                    type="text"
                    value={subPayNotes}
                    onChange={(e) => setSubPayNotes(e.target.value)}
                    placeholder="e.g. Partial — receiver returning tomorrow"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none transition-shadow"
                  />
                </div>
                {subPayError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{subPayError}</div>}
                <div className="flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setSubPayTx(null)}>Close</Button>
                  <Button onClick={handleSubPay} isLoading={subPayLoading} disabled={!subPayAmount || parseFloat(subPayAmount) <= 0}
                    className="bg-emerald-600 hover:bg-emerald-700">
                    Record Payment
                  </Button>
                </div>
              </div>
            )}

            {subPayRemaining <= 0 && (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setSubPayTx(null)}>Close</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bulk disburse confirmation */}
      <Modal
        isOpen={bulkConfirmOpen}
        onClose={() => { setBulkConfirmOpen(false); setBulkConfirmed(false); }}
        title={`Bulk Disburse ${selected.size} Transaction${selected.size !== 1 ? 's' : ''}`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
            You are about to disburse <strong>{selected.size} transaction{selected.size !== 1 ? 's' : ''}</strong>. This cannot be undone.
            <div className="mt-2 pt-2 border-t border-amber-200 flex justify-between font-semibold">
              <span>Total GHS</span>
              <span>
                {fmtGHS(transactions
                  .filter((t) => selected.has(t.id))
                  .reduce((s, t) => s + pendingAmount(t), 0))}
              </span>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={bulkConfirmed}
              onChange={(e) => setBulkConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <span className="text-sm text-gray-700">
              I confirm all selected receivers have been identity-verified and funds are ready to disburse.
            </span>
          </label>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setBulkConfirmOpen(false); setBulkConfirmed(false); }}>Cancel</Button>
            <Button onClick={handleBulkDisburse} isLoading={bulkSubmitting} disabled={!bulkConfirmed}
              className="bg-emerald-600 hover:bg-emerald-700">
              Confirm & Disburse All
            </Button>
          </div>
        </div>
      </Modal>

      {/* Multi-receiver disbursement modal */}
      <Modal
        isOpen={!!multiTx}
        onClose={() => setMultiTx(null)}
        title={`Multi-Receiver Disburse — ${multiTx?.transactionCode ?? ''}`}
        size="lg"
      >
        {multiTx && (
          <div className="space-y-5">
            {/* Transaction summary */}
            <div className="flex gap-3 p-4 bg-gray-50 border border-gray-200 rounded-2xl">
              <div className="flex-1 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Sender</span>
                  <span className="font-semibold text-gray-900">{multiTx.sender?.firstName} {multiTx.sender?.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total GHS</span>
                  <span className="font-bold text-emerald-700 text-base">{fmtGHS(Number(multiTx.ghsAmount))}</span>
                </div>
                {multiTx.receiversDeferred && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Receiver assignment</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-violet-100 text-violet-700">At branch (deferred)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Deferred mode: teller enters allocations */}
            {multiTx.receiversDeferred ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Receiver Allocations</p>
                  <p className="text-xs text-gray-400">
                    Allocated: {fmtGHS(multiAllocations.reduce((s, r) => s + parseFloat(r.ghsAmount || '0'), 0))}
                    {' / '}{fmtGHS(Number(multiTx.ghsAmount))}
                  </p>
                </div>

                {multiAllocations.map((row, idx) => (
                  <div key={row.id} className="p-4 border border-gray-200 rounded-2xl space-y-3 bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Receiver {idx + 1}</span>
                      {multiAllocations.length > 1 && (
                        <button
                          onClick={() => removeAllocationRow(row.id)}
                          className="text-red-400 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-50"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Full Name *</label>
                        <input
                          type="text"
                          value={row.receiverName}
                          onChange={(e) => updateAllocationRow(row.id, 'receiverName', e.target.value)}
                          placeholder="Receiver full name"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Phone *</label>
                        <input
                          type="text"
                          value={row.receiverPhone}
                          onChange={(e) => updateAllocationRow(row.id, 'receiverPhone', e.target.value)}
                          placeholder="+233 XX XXX XXXX"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">GHS Amount *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.ghsAmount}
                          onChange={(e) => updateAllocationRow(row.id, 'ghsAmount', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => updateAllocationRow(row.id, 'notes', e.target.value)}
                          placeholder="e.g. Cash in hand"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addAllocationRow}
                  className="w-full py-2.5 border-2 border-dashed border-violet-300 rounded-2xl text-sm font-semibold text-violet-600 hover:border-violet-400 hover:bg-violet-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Receiver
                </button>

                {/* Remaining balance indicator */}
                {(() => {
                  const allocated = multiAllocations.reduce((s, r) => s + parseFloat(r.ghsAmount || '0'), 0);
                  const remaining = Number(multiTx.ghsAmount) - allocated;
                  return Math.abs(remaining) >= 0.01 ? (
                    <div className={`p-3 rounded-xl text-sm flex justify-between font-semibold ${remaining < 0 ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                      <span>{remaining < 0 ? 'Over-allocated by' : 'Unallocated remaining'}</span>
                      <span>{fmtGHS(Math.abs(remaining))}</span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl text-sm flex justify-between font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                      <span>Fully allocated</span>
                      <span>GHS 0.00 remaining</span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Pre-assigned mode: show existing allocations (read-only) */
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">Pre-assigned Receivers</p>
                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">#</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Receiver</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Phone</th>
                        <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">GHS Amount</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {multiAllocations.map((row, idx) => (
                        <tr key={row.id}>
                          <td className="py-3 px-4 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="py-3 px-4 font-semibold text-gray-800">{row.receiverName}</td>
                          <td className="py-3 px-4 text-gray-500 text-xs">{row.receiverPhone}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">{fmtGHS(parseFloat(row.ghsAmount))}</td>
                          <td className="py-3 px-4 text-gray-400 text-xs">{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={3} className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Total</td>
                        <td className="py-2.5 px-4 text-right font-extrabold text-emerald-700">
                          {fmtGHS(multiAllocations.reduce((s, r) => s + parseFloat(r.ghsAmount || '0'), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ID confirmation */}
            <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={multiIdConfirmed}
                onChange={(e) => setMultiIdConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded-md border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700">
                I confirm all receiver identities have been verified and funds are ready to disburse.
              </span>
            </label>

            {multiError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{multiError}</div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setMultiTx(null)}>Cancel</Button>
              <Button
                onClick={handleMultiDisburse}
                isLoading={multiSubmitting}
                disabled={!multiIdConfirmed || multiAllocations.length === 0}
                className="bg-violet-600 hover:bg-violet-700"
              >
                Confirm & Disburse All
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
