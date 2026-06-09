'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';

interface BranchDate {
  receivingPointId: string;
  name: string;
  code: string;
  serverDate: string;
}

function addOneDay(d: string) {
  const dt = new Date(d + 'T00:00:00.000Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().split('T')[0];
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

export default function ServerDatesPage() {
  const { user } = useAuth();

  const canManageSending   = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'].includes(user?.role ?? '');
  const canManageReceiving = ['SUPER_ADMIN', 'ADMIN', 'RECEIVING_ADMIN'].includes(user?.role ?? '');

  // ─── Sending server date ───────────────────────────────────────────────────
  const [sendingDate, setSendingDate]       = useState<string | null>(null);
  const [sendingLoading, setSendingLoading] = useState(true);
  const [sendingEdit, setSendingEdit]       = useState(false);
  const [sendingInput, setSendingInput]     = useState('');
  const [sendingSaving, setSendingSaving]   = useState(false);
  const [sendingError, setSendingError]     = useState('');

  const loadSendingDate = useCallback(async () => {
    setSendingLoading(true);
    const res = await apiClient.getSendingServerDate();
    if (res.success && res.data) {
      const d = (res.data as { serverDate: string }).serverDate;
      setSendingDate(d);
      setSendingInput(d);
    }
    setSendingLoading(false);
  }, []);

  const saveSendingDate = async () => {
    if (!sendingInput) return;
    setSendingSaving(true);
    setSendingError('');
    const res = await apiClient.setSendingServerDate(sendingInput);
    if (res.success && res.data) {
      const d = (res.data as { serverDate: string }).serverDate;
      setSendingDate(d);
      setSendingInput(d);
      setSendingEdit(false);
    } else {
      setSendingError(res.error || 'Failed to update');
    }
    setSendingSaving(false);
  };

  // ─── Receiving branch dates ────────────────────────────────────────────────
  const [branches, setBranches]         = useState<BranchDate[]>([]);
  const [branchLoading, setBranchLoading] = useState(true);

  // Per-branch edit state: branchId → { open, input, saving, error }
  const [branchEdits, setBranchEdits] = useState<Record<string, {
    open: boolean; input: string; saving: boolean; error: string;
  }>>({});

  const loadBranchDates = useCallback(async () => {
    setBranchLoading(true);
    const res = await apiClient.getReceivingServerDate();
    if (res.success && res.data) {
      const list = Array.isArray(res.data)
        ? (res.data as BranchDate[])
        : [res.data as BranchDate];
      setBranches(list);
      const edits: typeof branchEdits = {};
      for (const b of list) {
        edits[b.receivingPointId] = { open: false, input: b.serverDate, saving: false, error: '' };
      }
      setBranchEdits(edits);
    }
    setBranchLoading(false);
  }, []);

  useEffect(() => {
    if (canManageSending) void loadSendingDate();
    else setSendingLoading(false);
    if (canManageReceiving) void loadBranchDates();
    else setBranchLoading(false);
  }, [canManageSending, canManageReceiving, loadSendingDate, loadBranchDates]);

  const openBranchEdit = (branchId: string) => {
    setBranchEdits((prev) => ({
      ...prev,
      [branchId]: { ...prev[branchId], open: true, error: '' },
    }));
  };

  const closeBranchEdit = (branchId: string) => {
    setBranchEdits((prev) => ({
      ...prev,
      [branchId]: { ...prev[branchId], open: false, error: '',
        input: branches.find((b) => b.receivingPointId === branchId)?.serverDate ?? prev[branchId].input },
    }));
  };

  const setBranchInput = (branchId: string, val: string) => {
    setBranchEdits((prev) => ({ ...prev, [branchId]: { ...prev[branchId], input: val } }));
  };

  const saveBranchDate = async (branchId: string) => {
    const edit = branchEdits[branchId];
    if (!edit?.input) return;
    setBranchEdits((prev) => ({ ...prev, [branchId]: { ...prev[branchId], saving: true, error: '' } }));
    const res = await apiClient.setReceivingServerDate({ date: edit.input, receivingPointId: branchId });
    if (res.success && res.data) {
      const d = (res.data as { serverDate: string }).serverDate;
      setBranches((prev) => prev.map((b) => b.receivingPointId === branchId ? { ...b, serverDate: d } : b));
      setBranchEdits((prev) => ({ ...prev, [branchId]: { open: false, input: d, saving: false, error: '' } }));
    } else {
      setBranchEdits((prev) => ({
        ...prev,
        [branchId]: { ...prev[branchId], saving: false, error: res.error || 'Failed to update' },
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Server Dates</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Manage the business date for each portal and branch. Dates advance automatically when EOD is closed.
        </p>
      </div>

      {/* ─── Sending Portal ─── */}
      {canManageSending && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 bg-blue-50/60">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900">Sending Portal</p>
              <p className="text-xs text-blue-600">Global business date — applies to all sending agents</p>
            </div>
          </div>

          <div className="p-5">
            {sendingLoading ? (
              <div className="h-8 w-48 bg-gray-100 rounded-xl animate-pulse" />
            ) : sendingEdit ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">New Business Date</label>
                  <input
                    type="date"
                    value={sendingInput}
                    onChange={(e) => setSendingInput(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  {sendingError && <p className="mt-1.5 text-xs text-red-600">{sendingError}</p>}
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={saveSendingDate}
                    disabled={sendingSaving || !sendingInput}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {sendingSaving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Save
                  </button>
                  <button
                    onClick={() => { setSendingEdit(false); setSendingInput(sendingDate ?? ''); setSendingError(''); }}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Current Business Date</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {sendingDate ? fmtDate(sendingDate) : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Next day after EOD close: {sendingDate ? fmtDate(addOneDay(sendingDate)) : '—'}
                  </p>
                </div>
                <button
                  onClick={() => { setSendingEdit(true); setSendingInput(sendingDate ?? ''); setSendingError(''); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <EditIcon className="w-3.5 h-3.5" />
                  Adjust
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Receiving Branches ─── */}
      {canManageReceiving && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 bg-emerald-50/60">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-900">Receiving Branches</p>
              <p className="text-xs text-emerald-600">Per-branch business dates — each branch advances independently on EOD close</p>
            </div>
          </div>

          {branchLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : branches.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">No active branches found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {branches.map((branch) => {
                const edit = branchEdits[branch.receivingPointId];
                return (
                  <div key={branch.receivingPointId} className="px-5 py-4">
                    {edit?.open ? (
                      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-mono">{branch.code}</span>
                            <span className="text-sm font-semibold text-gray-800">{branch.name}</span>
                          </div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">New Business Date</label>
                          <input
                            type="date"
                            value={edit.input}
                            onChange={(e) => setBranchInput(branch.receivingPointId, e.target.value)}
                            className="w-full sm:w-auto px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                          />
                          {edit.error && <p className="mt-1.5 text-xs text-red-600">{edit.error}</p>}
                        </div>
                        <div className="flex items-end gap-2">
                          <button
                            onClick={() => saveBranchDate(branch.receivingPointId)}
                            disabled={edit.saving || !edit.input}
                            className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center gap-2"
                          >
                            {edit.saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            Save
                          </button>
                          <button
                            onClick={() => closeBranchEdit(branch.receivingPointId)}
                            className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-emerald-700">{branch.code.slice(0, 3)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{branch.name}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {fmtDate(branch.serverDate)}
                              <span className="text-gray-300 mx-1.5">·</span>
                              <span className="text-gray-400">next: {fmtDate(addOneDay(branch.serverDate))}</span>
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => openBranchEdit(branch.receivingPointId)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors shrink-0"
                        >
                          <EditIcon className="w-3.5 h-3.5" />
                          Adjust
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Info card */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl text-xs text-gray-500 space-y-1.5">
        <p className="font-semibold text-gray-700">How server dates work</p>
        <p>• The <strong>sending server date</strong> advances automatically to the next calendar day when the sending EOD is closed.</p>
        <p>• Each <strong>receiving branch date</strong> advances independently when that branch closes its day.</p>
        <p>• New transactions are stamped with the current sending server date, not the system clock.</p>
        <p>• Use <strong>Adjust</strong> to manually correct a date — for example after a missed close or a holiday.</p>
      </div>
    </div>
  );
}
