'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiClient, CashManagementEntry } from '@/lib/api-client';

type OpType = 'CASH_DEPOSIT' | 'BANK_TRANSFER' | 'OPERATING_EXPENSE';

const EXPENSE_CODES = [
  { code: 'OPEX-GENERAL-CAD', label: 'General Operating Expense' },
  { code: 'OPEX-SALARY-CAD',  label: 'Staff Salaries & Wages' },
  { code: 'OPEX-BANK-FEE-CAD', label: 'Bank Charges & Fees' },
  { code: 'OPEX-OTHER-CAD',   label: 'Other Operating Expense' },
] as const;

type ExpenseCode = typeof EXPENSE_CODES[number]['code'];

const fmtCAD = (n: number) =>
  `CAD ${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TYPE_CONFIG: Record<OpType, { label: string; color: string; bg: string; border: string; icon: string; desc: string }> = {
  CASH_DEPOSIT:      { label: 'Cash Deposit',      color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200', icon: '↓', desc: 'Add physical cash into the sending vault' },
  BANK_TRANSFER:     { label: 'Bank Transfer',     color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',  icon: '→', desc: 'Move funds from vault to bank' },
  OPERATING_EXPENSE: { label: 'Operating Expense', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200',icon: '↑', desc: 'Record an expense paid from vault' },
};

const TYPE_LABELS: Record<string, string> = {
  CASH_DEPOSIT: 'Deposit',
  BANK_TRANSFER: 'Bank Transfer',
  OPERATING_EXPENSE: 'Expense',
};

export default function CashManagementPage() {
  const today = new Date().toISOString().split('T')[0];

  const [vault,        setVault]        = useState<number | null>(null);
  const [bankClearing, setBankClearing] = useState<number | null>(null);
  const [entries,      setEntries]      = useState<CashManagementEntry[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  // Modal state
  const [showModal,    setShowModal]    = useState(false);
  const [opType,       setOpType]       = useState<OpType>('CASH_DEPOSIT');
  const [amount,       setAmount]       = useState('');
  const [reference,    setReference]    = useState('');
  const [description,  setDescription]  = useState('');
  const [expenseCode,  setExpenseCode]  = useState<ExpenseCode>('OPEX-GENERAL-CAD');
  const [date,         setDate]         = useState(today);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [successMsg,   setSuccessMsg]   = useState('');

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    const res = await apiClient.getCashManagement({ page: p, limit: 20 });
    if (res.success && res.data) {
      setVault(res.data.vault?.balance ?? null);
      setBankClearing(res.data.bankClearing?.balance ?? null);
      setEntries(res.data.entries);
      setTotal(res.data.pagination.total);
      setTotalPages(res.data.pagination.totalPages);
    } else {
      setError(res.error ?? 'Failed to load cash management data');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const openModal = (type: OpType) => {
    setOpType(type);
    setAmount('');
    setReference('');
    setDescription('');
    setExpenseCode('OPEX-GENERAL-CAD');
    setDate(today);
    setSubmitError('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setSubmitError('Enter a valid positive amount');
      return;
    }
    if (!reference.trim()) {
      setSubmitError('Reference is required');
      return;
    }
    setSubmitting(true);
    setSubmitError('');

    const amt = Number(amount);
    let res;
    if (opType === 'CASH_DEPOSIT') {
      res = await apiClient.recordCashDeposit({ amount: amt, reference, description: description || undefined, date });
    } else if (opType === 'BANK_TRANSFER') {
      res = await apiClient.recordBankTransfer({ amount: amt, reference, description: description || undefined, date });
    } else {
      res = await apiClient.recordOperatingExpense({ amount: amt, expenseCode, reference, description: description || undefined, date });
    }

    if (res.success && res.data) {
      setVault(res.data.vaultBalance);
      setShowModal(false);
      setSuccessMsg(`${TYPE_CONFIG[opType].label} of ${fmtCAD(amt)} recorded.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      load(1);
      setPage(1);
    } else {
      setSubmitError(res.error ?? 'Failed to record entry');
    }
    setSubmitting(false);
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Cash Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage sending-side vault — deposits, bank transfers, and operating expenses</p>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {/* Vault Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-700 text-lg font-bold">$</div>
            <div>
              <p className="text-xs text-gray-400 font-medium">Sending Vault (CASH-CAD)</p>
              <p className="text-2xl font-bold text-green-700 mt-0.5">
                {vault === null ? '—' : fmtCAD(vault)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Physical cash held at the sending office. Increases on deposits; decreases on bank transfers and expenses.</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 text-lg font-bold">🏦</div>
            <div>
              <p className="text-xs text-gray-400 font-medium">Bank Clearing (BANK-CLEARING)</p>
              <p className="text-2xl font-bold text-blue-700 mt-0.5">
                {bankClearing === null ? '—' : fmtCAD(bankClearing)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Funds deposited to the bank from the vault. Increases when vault transfers to bank.</p>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(Object.entries(TYPE_CONFIG) as [OpType, typeof TYPE_CONFIG[OpType]][]).map(([type, cfg]) => (
          <button
            key={type}
            onClick={() => openModal(type)}
            className={`text-left p-5 rounded-2xl border ${cfg.border} ${cfg.bg} hover:shadow-md transition-shadow group`}
          >
            <div className={`w-9 h-9 rounded-xl border ${cfg.border} flex items-center justify-center text-xl font-bold ${cfg.color} mb-3`}>
              {cfg.icon}
            </div>
            <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
            <p className="text-xs text-gray-500 mt-1">{cfg.desc}</p>
          </button>
        ))}
      </div>

      {/* Journal History */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">Transaction History</h2>
          <span className="text-xs text-gray-400">{total} entries</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-violet-600 border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">No entries yet</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    {['Date', 'Type', 'Reference', 'Description', 'Amount', 'Recorded By'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const cfg = TYPE_CONFIG[entry.entryType as OpType];
                    // Amount = first debit line value
                    const debitLine = entry.lines.find((l) => l.debit > 0);
                    const amount = debitLine ? Number(debitLine.debit) : 0;
                    return (
                      <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(entry.journalDate).toLocaleDateString('en-CA')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.border} ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon} {TYPE_LABELS[entry.entryType] ?? entry.entryType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{entry.reference}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{entry.description}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmtCAD(amount)}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {entry.createdBy.firstName} {entry.createdBy.lastName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50 text-sm text-gray-500">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 text-xs"
                  >← Prev</button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 text-xs"
                  >Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            {/* Modal Header */}
            <div className={`px-6 py-4 rounded-t-2xl border-b ${TYPE_CONFIG[opType].bg} ${TYPE_CONFIG[opType].border}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`font-bold text-base ${TYPE_CONFIG[opType].color}`}>
                    {TYPE_CONFIG[opType].icon} {TYPE_CONFIG[opType].label}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">{TYPE_CONFIG[opType].desc}</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{submitError}</div>
              )}

              {/* Vault balance reminder */}
              {(opType === 'BANK_TRANSFER' || opType === 'OPERATING_EXPENSE') && vault !== null && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs">
                  Available vault balance: <strong>{fmtCAD(vault)}</strong>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Date</label>
                <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Amount (CAD)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls}
                />
              </div>

              {opType === 'OPERATING_EXPENSE' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Expense Category</label>
                  <select value={expenseCode} onChange={(e) => setExpenseCode(e.target.value as ExpenseCode)} className={inputCls}>
                    {EXPENSE_CODES.map((ec) => (
                      <option key={ec.code} value={ec.code}>{ec.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Reference</label>
                <input
                  type="text"
                  placeholder="e.g. DEP-2026-001"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="Brief note about this entry"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Double-entry preview */}
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 border border-gray-100">
                <p className="font-semibold text-gray-600 mb-2">Accounting Treatment</p>
                {opType === 'CASH_DEPOSIT' && (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>Dr  Company Cash — CAD</span><span className="text-green-600 font-mono">{amount ? fmtCAD(Number(amount)) : '—'}</span></div>
                    <div className="flex justify-between pl-4"><span>Cr  Retained Earnings — CAD</span><span className="text-red-500 font-mono">{amount ? fmtCAD(Number(amount)) : '—'}</span></div>
                  </div>
                )}
                {opType === 'BANK_TRANSFER' && (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>Dr  Bank / External Clearing</span><span className="text-green-600 font-mono">{amount ? fmtCAD(Number(amount)) : '—'}</span></div>
                    <div className="flex justify-between pl-4"><span>Cr  Company Cash — CAD</span><span className="text-red-500 font-mono">{amount ? fmtCAD(Number(amount)) : '—'}</span></div>
                  </div>
                )}
                {opType === 'OPERATING_EXPENSE' && (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>Dr  {EXPENSE_CODES.find((e) => e.code === expenseCode)?.label}</span><span className="text-green-600 font-mono">{amount ? fmtCAD(Number(amount)) : '—'}</span></div>
                    <div className="flex justify-between pl-4"><span>Cr  Company Cash — CAD</span><span className="text-red-500 font-mono">{amount ? fmtCAD(Number(amount)) : '—'}</span></div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                  opType === 'CASH_DEPOSIT'      ? 'bg-green-600 hover:bg-green-700' :
                  opType === 'BANK_TRANSFER'     ? 'bg-blue-600 hover:bg-blue-700' :
                  'bg-orange-600 hover:bg-orange-700'
                } disabled:opacity-50`}
              >
                {submitting ? 'Recording…' : `Record ${TYPE_CONFIG[opType].label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
