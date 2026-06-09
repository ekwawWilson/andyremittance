'use client';
import { useEffect, useState } from 'react';
import { apiClient, AccountingPeriod } from '@/lib/api-client';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_COLORS: Record<string, string> = {
  OPEN:   'bg-green-100 text-green-700',
  CLOSED: 'bg-amber-100 text-amber-700',
  LOCKED: 'bg-red-100 text-red-700',
};

export default function AccountingPeriodPage() {
  const currentYear = new Date().getFullYear();
  const [periods,  setPeriods]  = useState<AccountingPeriod[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const [statusFilter, setStatusFilter] = useState('');

  // New period form
  const [newYear,   setNewYear]   = useState<number>(currentYear);
  const [newMonth,  setNewMonth]  = useState<number>(new Date().getMonth() + 1);
  const [creating,  setCreating]  = useState(false);

  // Close/lock modal
  const [actionTarget, setActionTarget] = useState<AccountingPeriod | null>(null);
  const [actionType,   setActionType]   = useState<'CLOSE' | 'LOCK'>('CLOSE');
  const [actioning,    setActioning]    = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await apiClient.getAccountingPeriods({ year: yearFilter, status: statusFilter || undefined });
    if (res.success && res.data) setPeriods(res.data);
    else setError(res.error ?? 'Failed to load periods');
    setLoading(false);
  };

  useEffect(() => { load(); }, [yearFilter, statusFilter]);

  const handleCreate = async () => {
    setCreating(true);
    setError(''); setSuccess('');
    const res = await apiClient.createAccountingPeriod({ periodYear: newYear, periodMonth: newMonth });
    if (res.success) { setSuccess(`Period ${newYear}-${String(newMonth).padStart(2, '0')} opened`); load(); }
    else setError(res.error ?? 'Failed to create period');
    setCreating(false);
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    setActioning(true);
    setError(''); setSuccess('');
    const res = await apiClient.closeAccountingPeriod(actionTarget.id, actionType);
    if (res.success) {
      setSuccess(`Period ${actionType === 'CLOSE' ? 'closed' : 'locked'} successfully`);
      setActionTarget(null);
      load();
    } else {
      setError(res.error ?? 'Failed');
    }
    setActioning(false);
  };

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Accounting Periods</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage open, closed, and locked periods — controls journal posting</p>
      </div>

      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Open new period */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Open New Period</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Year</label>
              <input
                type="number"
                value={newYear}
                min={2020} max={2100}
                onChange={(e) => setNewYear(Number(e.target.value))}
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Month</label>
              <select value={newMonth} onChange={(e) => setNewMonth(Number(e.target.value))} className={`${inputCls} w-full`}>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m} ({i + 1})</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-400">
              Company-wide period. Branch-scoped periods can be opened via API.
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              {creating ? 'Opening…' : 'Open Period'}
            </button>
          </div>
        </div>

        {/* Filters + list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex gap-3 flex-wrap items-center">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 font-medium whitespace-nowrap">Year</label>
                <input
                  type="number"
                  value={yearFilter}
                  min={2020} max={2100}
                  onChange={(e) => setYearFilter(Number(e.target.value))}
                  className={`${inputCls} w-24`}
                />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
                <option value="">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
                <option value="LOCKED">Locked</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="animate-spin rounded-full h-7 w-7 border-2 border-violet-600 border-t-transparent" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Period</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Dates</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Scope</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Closed By</th>
                    <th className="py-3 px-4 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {periods.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No periods found</td>
                    </tr>
                  ) : (
                    periods.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-800">
                          {MONTH_NAMES[p.periodMonth - 1]} {p.periodYear}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400">
                          {new Date(p.startDate).toLocaleDateString('en-GH')} — {new Date(p.endDate).toLocaleDateString('en-GH')}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {p.receivingPoint ? p.receivingPoint.name : 'Company-Wide'}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400">
                          {p.closedBy ? `${p.closedBy.firstName} ${p.closedBy.lastName}` : '—'}
                          {p.closedAt && <span className="block text-[10px] text-gray-300">{new Date(p.closedAt).toLocaleDateString('en-GH')}</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {p.status === 'OPEN' && (
                            <button
                              onClick={() => { setActionTarget(p); setActionType('CLOSE'); }}
                              className="text-xs text-amber-600 hover:text-amber-800 font-medium mr-3"
                            >
                              Close
                            </button>
                          )}
                          {p.status === 'CLOSED' && (
                            <button
                              onClick={() => { setActionTarget(p); setActionType('LOCK'); }}
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                              Lock
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Close/Lock confirmation modal */}
      {actionTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">
              {actionType === 'CLOSE' ? 'Close' : 'Lock'} Period
            </h3>
            <p className="text-sm text-gray-600">
              {actionType === 'CLOSE'
                ? `Close ${MONTH_NAMES[actionTarget.periodMonth - 1]} ${actionTarget.periodYear}? New journal entries can still be posted to a closed period until it is locked.`
                : `Lock ${MONTH_NAMES[actionTarget.periodMonth - 1]} ${actionTarget.periodYear}? This permanently prevents any new journal entries for this period. This action cannot be undone.`}
            </p>
            {actionType === 'LOCK' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-red-600 text-sm font-bold mt-0.5">!</span>
                <p className="text-sm text-red-700">Locking requires admin privileges and cannot be reversed.</p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setActionTarget(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={actioning}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${actionType === 'LOCK' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {actioning ? 'Processing…' : (actionType === 'CLOSE' ? 'Close Period' : 'Lock Period')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
