'use client';
import { useEffect, useState } from 'react';
import { apiClient, JournalEntry } from '@/lib/api-client';
import { fmtNum } from '@/lib/utils/format';

const ENTRY_TYPE_COLORS: Record<string, string> = {
  REMITTANCE_RECEIPT:    'bg-blue-100 text-blue-700',
  SYNC_ALLOCATION:       'bg-emerald-100 text-emerald-700',
  DISBURSEMENT:          'bg-red-100 text-red-700',
  VAULT_TRANSFER:        'bg-amber-100 text-amber-700',
  TELLER_RECONCILIATION: 'bg-violet-100 text-violet-700',
  EXCHANGE_ADJUSTMENT:   'bg-sky-100 text-sky-700',
  MANUAL:                'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  POSTED:   'bg-green-100 text-green-700',
  DRAFT:    'bg-yellow-100 text-yellow-700',
  REVERSED: 'bg-red-100 text-red-700',
};

export default function JournalPage() {
  const today = new Date().toISOString().split('T')[0];
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(today);
  const [to,      setTo]      = useState(today);
  const [entryType, setEntryType] = useState('');
  const [page,    setPage]    = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [error,   setError]   = useState('');
  const LIMIT = 50;

  const load = async () => {
    setLoading(true);
    const res = await apiClient.getJournalEntries({ from, to, entryType: entryType || undefined, page, limit: LIMIT });
    if (res.success && res.data) {
      setEntries(res.data.entries);
      setTotal(res.data.pagination.total);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [from, to, entryType, page]);

  const handleReverse = async (id: string) => {
    if (!reverseReason.trim()) { setError('Provide a reason for the reversal'); return; }
    setError('');
    const res = await apiClient.reverseJournalEntry(id, reverseReason);
    if (res.success) { setReversing(null); setReverseReason(''); load(); }
    else setError(res.error ?? 'Failed to reverse');
  };

  const totalPages = Math.ceil(total / LIMIT);
  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Journal Entries</h1>
        <p className="text-sm text-gray-400 mt-0.5">{total} entries · complete accounting journal</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">From</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium whitespace-nowrap">To</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={inputCls} />
          </div>
          <select value={entryType} onChange={(e) => { setEntryType(e.target.value); setPage(1); }} className={inputCls}>
            <option value="">All Types</option>
            <option value="REMITTANCE_RECEIPT">Remittance Receipt</option>
            <option value="SYNC_ALLOCATION">Sync Allocation</option>
            <option value="DISBURSEMENT">Disbursement</option>
            <option value="VAULT_TRANSFER">Vault Transfer</option>
            <option value="TELLER_RECONCILIATION">Reconciliation</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reference</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Description</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Branch</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">By</th>
                <th className="py-3 px-4 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map((entry) => (
                <>
                  <tr key={entry.id} className={`hover:bg-gray-50/60 transition-colors cursor-pointer ${expanded === entry.id ? 'bg-violet-50/40' : ''}`}
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                    <td className="py-3 px-4 text-xs text-gray-500">{new Date(entry.journalDate).toLocaleDateString('en-GH')}</td>
                    <td className="py-3 px-4 font-mono text-xs font-bold text-blue-600">{entry.reference}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 max-w-xs truncate">{entry.description}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${ENTRY_TYPE_COLORS[entry.entryType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {entry.entryType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${STATUS_COLORS[entry.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400">{entry.receivingPoint?.name ?? 'Head Office'}</td>
                    <td className="py-3 px-4 text-xs text-gray-400">{entry.createdBy.firstName} {entry.createdBy.lastName}</td>
                    <td className="py-3 px-4 text-right">
                      {entry.status === 'POSTED' && entry.entryType === 'MANUAL' && (
                        <button onClick={(e) => { e.stopPropagation(); setReversing(entry.id); setReverseReason(''); setError(''); }}
                          className="text-xs text-red-500 hover:text-red-700 font-medium">Reverse</button>
                      )}
                    </td>
                  </tr>
                  {expanded === entry.id && (
                    <tr key={`${entry.id}-lines`} className="bg-violet-50/30">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="rounded-xl border border-violet-100 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-violet-100/50 border-b border-violet-100">
                                <th className="text-left py-2 px-3 font-semibold text-violet-700">Account</th>
                                <th className="text-right py-2 px-3 font-semibold text-violet-700">Debit</th>
                                <th className="text-right py-2 px-3 font-semibold text-violet-700">Credit</th>
                                <th className="text-left py-2 px-3 font-semibold text-violet-700">Ccy</th>
                                <th className="text-left py-2 px-3 font-semibold text-violet-700">Note</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-violet-50">
                              {entry.lines.map((line) => (
                                <tr key={line.id} className="hover:bg-violet-50/40">
                                  <td className="py-2 px-3 font-mono font-bold text-blue-600">{line.account.accountCode}
                                    <span className="ml-2 text-gray-500 font-normal font-sans">{line.account.accountName}</span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-gray-700">{line.debit > 0 ? fmtNum(line.debit) : '—'}</td>
                                  <td className="py-2 px-3 text-right font-bold text-gray-700">{line.credit > 0 ? fmtNum(line.credit) : '—'}</td>
                                  <td className="py-2 px-3 text-gray-500">{line.currency}</td>
                                  <td className="py-2 px-3 text-gray-400 italic">{line.description ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Reversal modal inline */}
                        {reversing === entry.id && (
                          <div className="mt-3 flex items-center gap-3">
                            <input type="text" placeholder="Reason for reversal…" value={reverseReason}
                              onChange={(e) => setReverseReason(e.target.value)}
                              className="flex-1 px-3 py-2 border border-red-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-400" />
                            <button onClick={() => handleReverse(entry.id)}
                              className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700">Confirm Reversal</button>
                            <button onClick={() => setReversing(null)}
                              className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/40">
              <span className="text-xs text-gray-400">Page {page} of {totalPages} · {total} total</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
