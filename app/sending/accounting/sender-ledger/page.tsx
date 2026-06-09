'use client';
import { useState } from 'react';
import { apiClient, GeneralLedgerResult } from '@/lib/api-client';
import { fmtCADSigned, fmtCAD } from '@/lib/utils/format';

const ENTRY_TYPE_COLORS: Record<string, string> = {
  REMITTANCE_RECEIPT: 'bg-blue-100 text-blue-700',
  SYNC_ALLOCATION:    'bg-emerald-100 text-emerald-700',
  MANUAL:             'bg-gray-100 text-gray-700',
};

export default function SenderLedgerPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 7) + '-01';
  const [accountCode, setAccountCode] = useState('RECEIVABLE-CAD');
  const [from, setFrom] = useState(firstOfMonth);
  const [to,   setTo]   = useState(today);
  const [result, setResult] = useState<GeneralLedgerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const load = async () => {
    if (!accountCode.trim()) { setError('Enter an account code'); return; }
    setLoading(true);
    setError('');
    const res = await apiClient.getGeneralLedger({ accountCode: accountCode.trim(), from, to });
    if (res.success && res.data) setResult(res.data);
    else { setError(res.error ?? 'Failed to load ledger'); setResult(null); }
    setLoading(false);
  };

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Sender Ledger</h1>
        <p className="text-sm text-gray-400 mt-0.5">General ledger view for sending-side accounts</p>
      </div>

      {/* Account quick-select + date range */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium">Account Code</label>
            <select
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              className={`${inputCls} w-52`}
            >
              <option value="CASH-CAD">CASH-CAD — Company Cash</option>
              <option value="RECEIVABLE-CAD">RECEIVABLE-CAD — Receivables</option>
              <option value="BANK-CLEARING">BANK-CLEARING — Bank Clearing</option>
              <option value="MOMO-CLEARING">MOMO-CLEARING — MoMo Clearing</option>
              <option value="INCOME-STANDARD">INCOME-STANDARD — Standard Fees</option>
              <option value="INCOME-ADDITIONAL">INCOME-ADDITIONAL — Additional Fees</option>
              <option value="EQUITY-RETAINED-CAD">EQUITY-RETAINED-CAD — Retained (CAD)</option>
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
          <button
            onClick={load}
            disabled={loading}
            className="px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          {/* Account summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  <span className="font-mono text-blue-600 mr-2">{result.account.accountCode}</span>
                  {result.account.accountName}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">{result.account.accountType} · {result.account.currency}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400 mb-1">Balance</p>
                <p className={`text-2xl font-bold ${result.closingBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {result.account.currency} {Number(result.closingBalance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Debits',   value: result.totalDebits,  color: 'text-blue-600' },
                { label: 'Credits',  value: result.totalCredits, color: 'text-green-600' },
                { label: 'Net',      value: result.netMovement,  color: result.netMovement < 0 ? 'text-red-600' : 'text-gray-700' },
              ].map((k) => (
                <div key={k.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">{k.label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${k.color}`}>
                    {result.account.currency} {Number(k.value).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Lines table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Reference</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Description</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">Debit</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">Credit</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.ledger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No entries in this date range</td>
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
                      <td className="py-3 px-4 text-right font-bold text-gray-700 text-xs">
                        {line.debit > 0 ? fmtCAD(line.debit) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-gray-700 text-xs">
                        {line.credit > 0 ? fmtCAD(line.credit) : '—'}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-xs ${line.runningBalance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                        {fmtCADSigned(line.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {result.ledger.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50/60 border-t border-gray-100">
                    <td colSpan={4} className="py-2 px-4 text-xs font-semibold text-gray-500 uppercase">Totals · {result.lineCount} lines</td>
                    <td className="py-2 px-4 text-right font-bold text-sm text-blue-700">{fmtCAD(result.totalDebits)}</td>
                    <td className="py-2 px-4 text-right font-bold text-sm text-green-700">{fmtCAD(result.totalCredits)}</td>
                    <td className="py-2 px-4 text-right font-bold text-sm text-violet-700">{fmtCADSigned(result.closingBalance)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
