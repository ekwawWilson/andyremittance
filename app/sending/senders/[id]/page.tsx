'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, Sender, Transaction } from '@/lib/api-client';
import { TransactionStatusBadge } from '@/components/ui/Badge';

function fmt(n: number | string) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initials(s: Sender) {
  return `${s.firstName[0] ?? ''}${s.lastName[0] ?? ''}`.toUpperCase();
}

const METHOD_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  CASH:  { bg: 'bg-green-100', text: 'text-green-700', label: 'Cash' },
  BANK:  { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Bank' },
  MOMO:  { bg: 'bg-purple-100',text: 'text-purple-700',label: 'MoMo' },
};

export default function SenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sender, setSender] = useState<Sender | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Payment modal
  const [paymentType, setPaymentType] = useState<'DEBT_PAYMENT' | 'CREDIT_NOTE' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  const loadData = async () => {
    const [senderRes, txnRes] = await Promise.all([
      apiClient.getSender(id),
      apiClient.getTransactions({ senderId: id, limit: 100 }),
    ]);
    if (senderRes.success && senderRes.data) setSender(senderRes.data);
    else router.push('/sending/senders');
    if (txnRes.success && txnRes.data) setTransactions(txnRes.data.transactions);
    setIsLoading(false);
  };

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPayment = (type: 'DEBT_PAYMENT' | 'CREDIT_NOTE') => {
    setPaymentType(type);
    setPaymentAmount('');
    setPaymentNotes('');
    setPaymentError('');
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentType || !sender) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) { setPaymentError('Amount must be greater than 0.'); return; }
    setPaymentError('');
    setPaymentSubmitting(true);
    try {
      const res = await apiClient.senderPayment(sender.id, {
        amount: amt,
        type: paymentType,
        paymentMethod,
        notes: paymentNotes,
      });
      if (res.success) {
        setPaymentType(null);
        const r = await apiClient.getSender(sender.id);
        if (r.success && r.data) setSender(r.data);
      } else {
        setPaymentError(res.error || 'Payment failed. Please try again.');
      }
    } catch {
      setPaymentError('Unexpected error. Please try again.');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
        <p className="text-sm text-gray-400">Loading sender…</p>
      </div>
    </div>
  );
  if (!sender) return null;

  const balance = Number(sender.senderLedger?.balance ?? 0);
  const creditLimit = Number(sender.creditLimit ?? 0);
  const isDebt = balance < 0;
  const creditUsedPct = creditLimit > 0 ? Math.min(100, (Math.abs(Math.min(balance, 0)) / creditLimit) * 100) : 0;

  const statusCounts = transactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Back / header actions */}
      <div className="flex items-center justify-between gap-4">
        <button onClick={() => router.push('/sending/senders')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Senders
        </button>
        <div className="flex items-center gap-2">
          <Link href={`/sending/senders/${sender.id}/statement`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Statement
          </Link>
          <Link href={`/sending/transactions/new`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Tx
          </Link>
        </div>
      </div>

      {/* Profile hero */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-linear-to-r from-blue-600 to-blue-500 px-6 pt-8 pb-16 relative">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_70%_50%,white,transparent)]" />
        </div>
        <div className="px-6 pb-6 -mt-10 relative">
          <div className="flex items-end gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white border-4 border-white shadow-lg flex items-center justify-center text-blue-700 text-2xl font-bold shrink-0">
              {initials(sender)}
            </div>
            <div className="pb-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{sender.firstName} {sender.lastName}</h1>
              <p className="text-sm text-gray-500">{sender.phone}{sender.email ? ` · ${sender.email}` : ''}</p>
            </div>
            <div className="ml-auto pb-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active
              </span>
            </div>
          </div>

          {/* Info grid */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Address', value: sender.address ? `${sender.address}${sender.city ? `, ${sender.city}` : ''}, ${sender.country}` : `${sender.country}` },
              { label: 'ID', value: sender.idType && sender.idNumber ? `${sender.idType}: ${sender.idNumber}` : '—' },
              { label: 'Credit Limit', value: `$${Number(sender.creditLimit).toLocaleString()}` },
              { label: 'Account Code', value: sender.senderLedger?.accountCode ?? '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm text-gray-700 mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Balance + credit limit + actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Balance card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 mb-3">Account Balance</p>
          <p className={`text-3xl font-bold tracking-tight ${isDebt ? 'text-red-600' : 'text-green-700'}`}>
            ${fmt(Math.abs(balance))}
            <span className="text-base font-medium ml-1">{isDebt ? 'owing' : 'credit'}</span>
          </p>
          {creditLimit > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Credit used</span>
                <span>${fmt(Math.abs(Math.min(balance, 0)))} / ${fmt(creditLimit)}</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${creditUsedPct > 80 ? 'bg-red-500' : creditUsedPct > 50 ? 'bg-amber-400' : 'bg-green-500'}`}
                  style={{ width: `${creditUsedPct}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            {isDebt && (
              <button onClick={() => openPayment('DEBT_PAYMENT')}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors">
                Pay Debt
              </button>
            )}
            <button onClick={() => openPayment('CREDIT_NOTE')}
              className="flex-1 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors">
              Credit Note
            </button>
          </div>
        </div>

        {/* Volume KPIs */}
        {sender.volume && (
          <>
            {([
              { label: 'Last 30 Days', v: sender.volume.last30Days, color: 'text-blue-700' },
              { label: `YTD ${new Date().getFullYear()}`, v: sender.volume.ytd, color: 'text-purple-700' },
            ] as const).map(({ label, v, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
                <p className={`text-2xl font-bold tracking-tight ${color}`}>${fmt(v.cadAmount)}</p>
                <p className="text-xs text-gray-400 mt-1">{v.count} transaction{v.count !== 1 ? 's' : ''}</p>
                <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
                  {(['PENDING', 'SYNCED', 'PAID'] as const).map((s) => (
                    <div key={s}>
                      <p className="text-lg font-bold text-gray-800">{statusCounts[s] ?? 0}</p>
                      <p className="text-[10px] text-gray-400">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Receivers */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Receivers</h2>
          <span className="text-xs text-gray-400">{sender.receivers?.length ?? 0} on file</span>
        </div>
        {sender.receivers && sender.receivers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  {['Name', 'Phone', 'Payout Method', 'Account Details', 'Relationship'].map((h) => (
                    <th key={h} className="text-left py-3 px-5 text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sender.receivers.map((r) => {
                  const mb = METHOD_BADGE[r.preferredMethod ?? 'CASH'] ?? METHOD_BADGE.CASH;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-gray-900">{r.firstName} {r.lastName}</td>
                      <td className="py-3.5 px-5 font-mono text-xs text-gray-500">{r.phone}</td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${mb.bg} ${mb.text}`}>{mb.label}</span>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-gray-500 font-mono">
                        {r.preferredMethod === 'BANK' && r.bankName ? `${r.bankName} · ${r.bankAccount}` :
                          r.preferredMethod === 'MOMO' && r.momoProvider ? `${r.momoProvider} · ${r.momoNumber}` : '—'}
                      </td>
                      <td className="py-3.5 px-5 text-gray-500 text-xs">{r.relationshipToSender || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center">
            <p className="text-gray-400 text-sm">No receivers on file for this sender</p>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Transaction History</h2>
          <span className="text-xs text-gray-400">{transactions.length} total</span>
        </div>
        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  {['Code', 'Receiver', 'CAD', 'GHS', 'Branch', 'Status', 'Date'].map((h) => (
                    <th key={h} className="text-left py-3 px-5 text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((t) => (
                  <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${t.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                    <td className="py-3.5 px-5">
                      <Link href={`/sending/transactions/${t.id}`}
                        className="font-mono text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                        {t.transactionCode}
                      </Link>
                    </td>
                    <td className="py-3.5 px-5 text-gray-700">
                      {t.receiversDeferred
                        ? <span className="text-xs text-amber-600 font-medium italic">Deferred</span>
                        : `${t.receiver?.firstName ?? '—'} ${t.receiver?.lastName ?? ''}`}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-gray-800">${fmt(t.cadAmount)}</td>
                    <td className="py-3.5 px-5 text-xs text-gray-500">GHS {fmt(t.ghsAmount)}</td>
                    <td className="py-3.5 px-5 text-xs text-gray-500">{t.receivingPoint?.name ?? '—'}</td>
                    <td className="py-3.5 px-5">
                      <div className="flex flex-col gap-1">
                        <TransactionStatusBadge status={t.status} />
                        {t.syncedToReceiving && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 w-fit">Synced</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(t.transactionDate).toLocaleDateString('en-CA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center">
            <p className="text-gray-400 text-sm">No transactions yet</p>
            <Link href="/sending/transactions/new"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Create first transaction
            </Link>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentType !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {paymentType === 'DEBT_PAYMENT' ? 'Record Debt Payment' : 'Add Credit Note'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{sender.firstName} {sender.lastName}</p>
              </div>
              <button onClick={() => setPaymentType(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handlePayment} className="p-6 space-y-4">
              {paymentError && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {paymentError}
                </div>
              )}

              {paymentType === 'DEBT_PAYMENT' && isDebt && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-700">Outstanding debt: <span className="font-bold">${fmt(Math.abs(balance))}</span></p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (CAD) <span className="text-red-500">*</span></label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00" required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'CASH', label: '💵 Cash' }, { value: 'E_TRANSFER', label: '📤 E-Transfer' }].map((m) => (
                    <button key={m.value} type="button"
                      onClick={() => setPaymentMethod(m.value)}
                      className={`py-2 text-sm font-medium rounded-xl border-2 transition-all ${paymentMethod === m.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} rows={2}
                  placeholder="Optional reference or note…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setPaymentType(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={paymentSubmitting}
                  className={`px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-all shadow-sm ${paymentType === 'DEBT_PAYMENT' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {paymentSubmitting ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing…
                    </span>
                  ) : paymentType === 'DEBT_PAYMENT' ? 'Record Payment' : 'Add Credit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
