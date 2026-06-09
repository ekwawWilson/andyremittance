'use client';

import { useEffect, useState } from 'react';
import { apiClient, GeneralLedgerResult, LedgerAccount, TillStatus } from '@/lib/api-client';
import { fmtNum } from '@/lib/utils/format';
import { useAuth } from '@/contexts/AuthContext';

const ENTRY_TYPE_COLORS: Record<string, string> = {
  DISBURSEMENT: 'bg-red-100 text-red-700',
  VAULT_TRANSFER: 'bg-amber-100 text-amber-700',
  TELLER_RECONCILIATION: 'bg-violet-100 text-violet-700',
  MANUAL: 'bg-gray-100 text-gray-700',
};

function fmt(amount: number) {
  return Number(amount).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type TellerTillAccount = LedgerAccount & {
  user?: { firstName: string; lastName: string; email: string } | null;
};

export default function TillLedgerPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 7) + '-01';
  const isTeller = user?.role === 'TELLER';

  const [selectedDate, setSelectedDate] = useState(today);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const [tills, setTills] = useState<TellerTillAccount[]>([]);
  const [selectedTillId, setSelectedTillId] = useState('');

  const [result, setResult] = useState<GeneralLedgerResult | null>(null);
  const [tillStatus, setTillStatus] = useState<TillStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');

  const inputCls =
    'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';

  const loadTellerStatement = async (date?: string) => {
    setLoading(true);
    setError('');
    const res = await apiClient.getTillStatus(date ? { date } : undefined);
    if (res.success && res.data) {
      setTillStatus(res.data);
    } else {
      setError(res.error ?? 'Failed to load your till statement');
      setTillStatus(null);
    }
    setLoading(false);
    setBootLoading(false);
  };

  const loadAccessibleTills = async () => {
    setBootLoading(true);
    setError('');
    const res = await apiClient.getLedgerAccounts({
      accountType: 'TELLER_TILL',
      receivingPointId: user?.receivingPoint?.id || undefined,
    });

    if (res.success && res.data) {
      const accounts = (res.data as TellerTillAccount[]).sort((a, b) => {
        const aName = `${a.user?.firstName ?? ''} ${a.user?.lastName ?? ''}`.trim();
        const bName = `${b.user?.firstName ?? ''} ${b.user?.lastName ?? ''}`.trim();
        return aName.localeCompare(bName);
      });

      setTills(accounts);
      setSelectedTillId((current) => {
        if (current && accounts.some((account) => account.id === current)) return current;
        return accounts[0]?.id ?? '';
      });
    } else {
      setError(res.error ?? 'Failed to load teller tills');
      setTills([]);
      setSelectedTillId('');
    }

    setBootLoading(false);
  };

  const loadSelectedLedger = async () => {
    if (!selectedTillId) {
      setResult(null);
      return;
    }

    setLoading(true);
    setError('');
    const res = await apiClient.getGeneralLedger({ accountId: selectedTillId, from, to });
    if (res.success && res.data) {
      setResult(res.data);
    } else {
      setError(res.error ?? 'Failed to load till ledger');
      setResult(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    if (isTeller) {
      void loadTellerStatement();
      return;
    }
    void loadAccessibleTills();
  }, [user, isTeller]);

  useEffect(() => {
    if (!user || !isTeller) return;
    void loadTellerStatement(selectedDate !== today ? selectedDate : undefined);
  }, [user, isTeller, selectedDate, today]);

  useEffect(() => {
    if (!user || isTeller || !selectedTillId) return;
    void loadSelectedLedger();
  }, [user, isTeller, selectedTillId, from, to]);

  const selectedTill = tills.find((account) => account.id === selectedTillId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
          {isTeller ? 'My Till Ledger' : 'Till Ledger'}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {isTeller
            ? 'Your teller statement is identified automatically from your active session.'
            : 'Select a teller first. Branch users only see tellers in their assigned branch.'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        {isTeller ? (
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-medium">Statement Date</label>
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        ) : (
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1 min-w-72">
              <label className="text-xs text-gray-400 font-medium">Teller</label>
              <select
                value={selectedTillId}
                onChange={(e) => setSelectedTillId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select teller...</option>
                {tills.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.user?.firstName} {account.user?.lastName} ({account.accountCode})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-medium">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-medium">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {(bootLoading || loading) && (
        <div className="flex items-center justify-center h-40 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-600 border-t-transparent" />
        </div>
      )}

      {!bootLoading && !loading && isTeller && tillStatus && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  <span className="font-mono text-blue-600 mr-2">{tillStatus.till?.accountCode ?? 'NO-TILL'}</span>
                  {tillStatus.till?.accountName ?? 'Till not created'}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  Statement date: {new Date((selectedDate || today) + 'T12:00:00').toLocaleDateString('en-GH')}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Closing Balance</p>
                <p className={`text-2xl font-bold ${Number(tillStatus.balance) < 0 ? 'text-red-600' : Number(tillStatus.balance) < 500 ? 'text-amber-600' : 'text-emerald-700'}`}>
                  GHS {fmt(Number(tillStatus.balance))}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Time</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Description</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Cash In</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Cash Out</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tillStatus.statement.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No entries for this date</td>
                  </tr>
                ) : (
                  tillStatus.statement.map((line) => (
                    <tr key={line.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 text-xs text-gray-500">
                        {new Date(line.createdAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">{line.description}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${ENTRY_TYPE_COLORS[line.entryType] ?? 'bg-gray-100 text-gray-600'}`}>
                          {line.entryType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-xs ${line.isDebit ? 'text-blue-600' : 'text-gray-300'}`}>
                        {line.isDebit ? fmt(Number(line.amount)) : '—'}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-xs ${!line.isDebit ? 'text-red-600' : 'text-gray-300'}`}>
                        {!line.isDebit ? fmt(Number(line.amount)) : '—'}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-xs ${line.runningBalance < 0 ? 'text-red-600' : line.runningBalance < 500 ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {fmt(Number(line.runningBalance))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!bootLoading && !loading && !isTeller && selectedTill && result && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  <span className="font-mono text-blue-600 mr-2">{result.account.accountCode}</span>
                  {selectedTill.user?.firstName} {selectedTill.user?.lastName}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {result.account.accountName} · {result.account.accountType} · {result.account.currency}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Till Balance</p>
                <p className={`text-2xl font-bold ${result.closingBalance < 0 ? 'text-red-600' : result.closingBalance < 500 ? 'text-amber-600' : 'text-emerald-700'}`}>
                  GHS {fmt(Number(result.closingBalance))}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Total In (Debits)', value: result.totalDebits, color: 'text-blue-600' },
                { label: 'Total Out (Credits)', value: result.totalCredits, color: 'text-red-600' },
                { label: 'Net Movement', value: result.netMovement, color: result.netMovement < 0 ? 'text-red-600' : 'text-emerald-700' },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">{kpi.label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${kpi.color}`}>
                    GHS {fmt(Number(kpi.value))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reference</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Description</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Dr (In)</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Cr (Out)</th>
                  <th className="text-right py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.ledger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No entries in this date range</td>
                  </tr>
                ) : (
                  result.ledger.map((line) => (
                    <tr key={line.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 text-xs text-gray-500">
                        {new Date(line.journalEntry.journalDate).toLocaleDateString('en-GH')}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-bold text-blue-600">{line.journalEntry.reference}</td>
                      <td className="py-3 px-4 text-xs text-gray-600 max-w-xs truncate">
                        {line.description ?? line.journalEntry.description}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${ENTRY_TYPE_COLORS[line.journalEntry.entryType] ?? 'bg-gray-100 text-gray-600'}`}>
                          {line.journalEntry.entryType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-xs ${line.debit > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                        {line.debit > 0 ? fmtNum(line.debit) : '—'}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-xs ${line.credit > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {line.credit > 0 ? fmtNum(line.credit) : '—'}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-xs ${line.runningBalance < 0 ? 'text-red-600' : line.runningBalance < 500 ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {fmtNum(line.runningBalance)}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400">
                        {line.journalEntry.createdBy.firstName} {line.journalEntry.createdBy.lastName}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!bootLoading && !loading && !error && !isTeller && tills.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-500">
          No accessible teller tills were found for your scope.
        </div>
      )}
    </div>
  );
}
