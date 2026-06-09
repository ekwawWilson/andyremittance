'use client';
import { useEffect, useState } from 'react';
import { apiClient, TillStatus, TillStatementEntry, CashTransferRequest } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingServerDate } from '@/lib/hooks/useReceivingServerDate';

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '0.00';
  return Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const GHS_DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.01];

function DenominationCalculator({ onTotal }: { onTotal: (total: number) => void }) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const total = GHS_DENOMS.reduce((sum, d) => sum + d * (parseFloat(counts[d] || '0') || 0), 0);
  useEffect(() => { onTotal(total); }, [total]);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Denomination Count</p>
      </div>
      <div className="divide-y divide-gray-100">
        {GHS_DENOMS.map((d) => {
          const count = parseFloat(counts[d] || '0') || 0;
          const subtotal = d * count;
          return (
            <div key={d} className="flex items-center gap-3 px-4 py-2">
              <span className="text-sm font-semibold text-gray-700 w-16 shrink-0">
                GHS {d >= 1 ? d : d.toFixed(2)}
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={counts[d] || ''}
                onChange={(e) => setCounts((prev) => ({ ...prev, [d]: e.target.value }))}
                placeholder="0"
                className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400 flex-1">&times;</span>
              <span className={`text-sm font-medium w-24 text-right ${subtotal > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                {subtotal > 0 ? `GHS ${fmt(subtotal)}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="bg-emerald-50 border-t border-emerald-200 px-4 py-3 flex justify-between items-center">
        <span className="text-sm font-bold text-emerald-800">Total Count</span>
        <span className="text-lg font-bold text-emerald-700">GHS {fmt(total)}</span>
      </div>
    </div>
  );
}

const RECON_STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PENDING:  'bg-amber-100 text-amber-800 border-amber-200',
  APPROVED: 'bg-green-100 text-green-800 border-green-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
};

const TRANSFER_STATUS_STYLES: Record<string, string> = {
  PENDING:  'bg-amber-50 border-amber-200 text-amber-800',
  APPROVED: 'bg-green-50 border-green-200 text-green-800',
  REJECTED: 'bg-red-50 border-red-200 text-red-800',
};

const TRANSFER_STATUS_BADGE: Record<string, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function TillPage() {
  const { user } = useAuth();
  const isTeller = user?.role === 'TELLER';
  const { serverDate, loading: serverDateLoading } = useReceivingServerDate();

  // Date range mode: 'day' = single date picker, 'period' = start+end pickers
  const [viewMode, setViewMode] = useState<'day' | 'period'>('day');
  const [selectedDate, setSelectedDate] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Initialise date states once the server date loads
  useEffect(() => {
    if (serverDateLoading || selectedDate) return;
    const d7ago = new Date(serverDate + 'T00:00:00.000Z');
    d7ago.setUTCDate(d7ago.getUTCDate() - 6);
    setSelectedDate(serverDate);
    setPeriodStart(d7ago.toISOString().split('T')[0]);
    setPeriodEnd(serverDate);
  }, [serverDate, serverDateLoading]);

  const [status, setStatus]   = useState<TillStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]     = useState('');
  const [allRequests, setAllRequests] = useState<CashTransferRequest[]>([]);
  const [showAllTransfers, setShowAllTransfers] = useState(false);

  // Load from external modal
  const [showLoad, setShowLoad]       = useState(false);
  const [loadAmount, setLoadAmount]   = useState('');
  const [loadSource, setLoadSource]   = useState('BANK_WITHDRAWAL');
  const [loadNotes, setLoadNotes]     = useState('');
  const [loadError, setLoadError]     = useState('');
  const [loadSubmitting, setLoadSubmitting] = useState(false);
  const [useDenomCalc, setUseDenomCalc] = useState(false);

  // Vault-to-teller modal
  const [showVaultLoad, setShowVaultLoad]     = useState(false);
  const [vaultId, setVaultId]                 = useState('');
  const [vaultAmount, setVaultAmount]         = useState('');
  const [vaultNotes, setVaultNotes]           = useState('');
  const [vaultError, setVaultError]           = useState('');
  const [vaultSubmitting, setVaultSubmitting] = useState(false);

  // Return to vault modal
  const [showReturn, setShowReturn]           = useState(false);
  const [returnVaultId, setReturnVaultId]     = useState('');
  const [returnAmount, setReturnAmount]       = useState('');
  const [returnNotes, setReturnNotes]         = useState('');
  const [returnError, setReturnError]         = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    setError('');
    const tillParams =
      viewMode === 'period'
        ? { startDate: periodStart, endDate: periodEnd }
        : selectedDate !== serverDate
          ? { date: selectedDate }
          : undefined;

    const [statusRes, requestsRes] = await Promise.all([
      apiClient.getTillStatus(tillParams),
      apiClient.getTransferRequests(),
    ]);
    if (statusRes.success && statusRes.data) {
      setStatus(statusRes.data);
      if (statusRes.data.vaults.length > 0) {
        setVaultId(statusRes.data.vaults[0].id);
        setReturnVaultId(statusRes.data.vaults[0].id);
      }
    } else {
      setError(statusRes.error || 'Failed to load till');
    }
    if (requestsRes.success && requestsRes.data) {
      setAllRequests(requestsRes.data);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchStatus(); }, [viewMode, selectedDate, periodStart, periodEnd]);

  const handleLoadExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadError('');
    setLoadSubmitting(true);
    const res = await apiClient.loadTillFromExternal(parseFloat(loadAmount), loadSource, loadNotes || undefined);
    if (res.success) {
      setShowLoad(false);
      setLoadAmount('');
      setLoadNotes('');
      setUseDenomCalc(false);
      fetchStatus();
    } else {
      setLoadError(res.error || 'Failed');
    }
    setLoadSubmitting(false);
  };

  const handleVaultLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError('');
    setVaultSubmitting(true);
    const res = await apiClient.vaultToSelfTill(vaultId, parseFloat(vaultAmount), vaultNotes || undefined);
    if (res.success) {
      setShowVaultLoad(false);
      setVaultAmount('');
      setVaultNotes('');
      fetchStatus();
    } else {
      setVaultError(res.error || 'Failed');
    }
    setVaultSubmitting(false);
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setReturnError('');
    setReturnSubmitting(true);
    const res = await apiClient.tellerToVault(returnVaultId, parseFloat(returnAmount), returnNotes || undefined);
    if (res.success) {
      setShowReturn(false);
      setReturnAmount('');
      setReturnNotes('');
      fetchStatus();
    } else {
      setReturnError(res.error || 'Failed');
    }
    setReturnSubmitting(false);
  };

  const handlePrintSlip = () => {
    if (!status) return;
    const rows = (status.statement ?? []).map((e) => `
      <tr>
        <td>${new Date(e.createdAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${e.entryType}</td>
        <td>${e.description ?? ''}</td>
        <td style="text-align:right">${e.isDebit ? fmt(e.amount) : ''}</td>
        <td style="text-align:right">${!e.isDebit ? fmt(e.amount) : ''}</td>
        <td style="text-align:right">${fmt(e.runningBalance)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Till Slip</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 11px; margin: 20px; color: #111; }
        h1 { font-size: 14px; margin-bottom: 2px; } .meta { color: #555; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #d1d5db; font-size: 10px; text-transform: uppercase; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        .total-row { font-weight: bold; background: #f0fdf4; }
        @media print { button { display: none !important; } }
      </style></head><body>
      <h1>Teller Till Slip</h1>
      <p class="meta">
        Account: <strong>${status.till?.accountName ?? ''}</strong> &nbsp;|&nbsp;
        Code: <strong>${status.till?.accountCode ?? ''}</strong> &nbsp;|&nbsp;
        Date: <strong>${viewMode === 'period' ? `${periodStart} to ${periodEnd}` : selectedDate}</strong> &nbsp;|&nbsp;
        Printed: <strong>${new Date().toLocaleTimeString()}</strong>
      </p>
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Description</th><th style="text-align:right">Cash In</th><th style="text-align:right">Cash Out</th><th style="text-align:right">Balance</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="3">Closing Balance</td>
            <td></td><td></td>
            <td style="text-align:right">GHS ${fmt(status.balance ?? 0)}</td>
          </tr>
        </tbody>
      </table>
      <script>window.print();<\/script>
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{error}</div>;
  }

  const isHistorical   = viewMode === 'period' || selectedDate !== serverDate;
  const balance        = status?.balance ?? 0;
  const statement      = status?.statement ?? [];
  const vaults         = status?.vaults ?? [];
  const todayRecon     = status?.todayReconciliation ?? null;
  const reconForDate   = status?.reconciliationForDate ?? null;
  const activeRecon    = isHistorical ? reconForDate : todayRecon;

  const totalIn      = statement.filter((e) => e.isDebit).reduce((s, e) => s + Number(e.amount), 0);
  const disbursements = statement.filter((e) => e.entryType === 'DISBURSEMENT');
  const disbursed    = disbursements.reduce((s, e) => s + Number(e.amount), 0);
  const returns      = statement.filter((e) => e.entryType === 'TRANSFER' && !e.isDebit).reduce((s, e) => s + Number(e.amount), 0);

  const isLowFloat      = !isHistorical && balance > 0 && balance < 500;
  const isCriticalFloat = !isHistorical && balance > 0 && balance < 200;

  const pendingRequests  = allRequests.filter((r) => r.status === 'PENDING');
  const resolvedRequests = allRequests.filter((r) => r.status !== 'PENDING');
  const displayedRequests = showAllTransfers ? allRequests : allRequests.filter((r) => r.status === 'PENDING');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Till</h1>
          {status?.till && (
            <p className="text-sm text-gray-500 mt-0.5">
              {status.till.accountName} &middot; <span className="font-mono">{status.till.accountCode}</span>
            </p>
          )}
          {/* Server date badge */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {serverDateLoading ? (
              <span className="h-3.5 w-28 bg-gray-100 rounded animate-pulse inline-block" />
            ) : (
              <span className="text-xs font-semibold text-emerald-700">
                Business date: {new Date(serverDate + 'T12:00:00').toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Day / Period mode toggle */}
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden text-sm">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === 'day' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('period')}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === 'period' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Period
            </button>
          </div>

          {viewMode === 'day' ? (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm text-gray-700 bg-transparent focus:outline-none"
              />
              {selectedDate !== serverDate && (
                <button
                  onClick={() => setSelectedDate(serverDate)}
                  className="text-xs text-violet-600 font-semibold hover:underline ml-1"
                >
                  Today
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                value={periodStart}
                max={periodEnd}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="text-sm text-gray-700 bg-transparent focus:outline-none"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={periodEnd}
                min={periodStart}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="text-sm text-gray-700 bg-transparent focus:outline-none"
              />
            </div>
          )}

          <button
            onClick={handlePrintSlip}
            disabled={statement.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span className="hidden sm:inline">Print Slip</span>
          </button>
          {isTeller && !isHistorical && (
            <>
              <Button variant="secondary" onClick={() => { setShowReturn(true); setReturnError(''); }}>
                Return to Vault
              </Button>
              <Button variant="secondary" onClick={() => { setShowVaultLoad(true); setVaultError(''); }}>
                Request from Vault
              </Button>
              <Button onClick={() => { setShowLoad(true); setLoadError(''); }}>
                + Load Cash
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Historical / period banner */}
      {isHistorical && (
        <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
          <svg className="w-4 h-4 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-violet-800">
            {viewMode === 'period' ? (
              <>Viewing period statement from <strong>{new Date(periodStart + 'T12:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}</strong> to <strong>{new Date(periodEnd + 'T12:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>. Actions are disabled for historical views.</>
            ) : (
              <>Viewing historical statement for <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>. Actions are disabled for historical views.</>
            )}
          </p>
        </div>
      )}

      {/* Low float alerts (today only) */}
      {isCriticalFloat && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-xl">
          <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-bold text-red-800">Critical: Till balance is very low (GHS {fmt(balance)})</p>
            <p className="text-xs text-red-700 mt-0.5">Request a vault transfer or load cash immediately to continue disbursements.</p>
          </div>
        </div>
      )}
      {isLowFloat && !isCriticalFloat && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl">
          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-bold text-amber-800">Low Float Warning (GHS {fmt(balance)})</p>
            <p className="text-xs text-amber-700 mt-0.5">Consider requesting a top-up from the branch vault.</p>
          </div>
        </div>
      )}

      {/* Reconciliation status badge */}
      {activeRecon && (
        <div className={`flex items-center justify-between gap-3 p-3 border rounded-xl ${RECON_STATUS_STYLES[activeRecon.status]}`}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm font-semibold">
              {isHistorical ? 'Reconciliation' : "Today's Reconciliation"}:&nbsp;
              <span className="font-bold">{activeRecon.status}</span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span>Expected: GHS {fmt(activeRecon.expectedClosing)}</span>
            <span>Actual: GHS {fmt(activeRecon.actualClosing)}</span>
            <span className={Math.abs(activeRecon.variance) < 0.01 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
              Variance: GHS {fmt(activeRecon.variance)}
            </span>
          </div>
        </div>
      )}
      {!activeRecon && !isHistorical && (
        <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm text-gray-500">No reconciliation submitted for today yet.</span>
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1">
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">
              {isHistorical ? 'Closing Balance' : 'Till Balance'}
            </p>
            <p className={`text-3xl font-bold mt-1 ${isCriticalFloat ? 'text-red-600' : isLowFloat ? 'text-amber-600' : balance === 0 ? 'text-gray-500' : 'text-emerald-700'}`}>
              GHS {fmt(balance)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{statement.length} entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Cash Loaded</p>
            <p className="text-xl font-bold text-blue-700 mt-1">GHS {fmt(totalIn)}</p>
            <p className="text-xs text-gray-400 mt-0.5">from all sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Disbursed</p>
            <p className="text-xl font-bold text-orange-600 mt-1">GHS {fmt(disbursed)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{disbursements.length} payment{disbursements.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Returned to Vault</p>
            <p className="text-xl font-bold text-violet-600 mt-1">GHS {fmt(returns)}</p>
            <p className="text-xs text-gray-400 mt-0.5">outgoing transfers</p>
          </CardContent>
        </Card>
      </div>

      {/* Vault balances */}
      {vaults.length > 0 && (
        <Card>
          <CardContent>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Branch Vault Balances</p>
            <div className="flex flex-wrap gap-3">
              {vaults.map((v) => {
                const vb = Number(v.balance);
                const vColor = vb >= 5000 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : vb >= 1000 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700';
                return (
                  <div key={v.id} className={`flex-1 min-w-36 ${vColor} border rounded-xl px-4 py-3`}>
                    <p className="text-xs font-semibold">{v.accountName}</p>
                    <p className="text-lg font-bold mt-0.5">GHS {fmt(vb)}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfer requests (all statuses) */}
      {allRequests.length > 0 && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Transfer Requests
                {pendingRequests.length > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    {pendingRequests.length} pending
                  </span>
                )}
              </p>
              {resolvedRequests.length > 0 && (
                <button
                  onClick={() => setShowAllTransfers((v) => !v)}
                  className="text-xs text-violet-600 hover:underline font-medium"
                >
                  {showAllTransfers ? 'Show pending only' : `Show all (${allRequests.length})`}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {displayedRequests.map((req) => (
                <div key={req.id} className={`flex items-start justify-between p-3 border rounded-xl text-sm ${TRANSFER_STATUS_STYLES[req.status]}`}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">GHS {fmt(Number(req.amount))}</span>
                      <span className="text-xs opacity-80">from {req.fromAccount?.accountName} → {req.toAccount?.accountName}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TRANSFER_STATUS_BADGE[req.status]}`}>
                        {req.status}
                      </span>
                    </div>
                    {req.notes && <p className="text-xs opacity-70 mt-0.5">{req.notes}</p>}
                    {req.rejectionReason && (
                      <p className="text-xs text-red-600 mt-0.5 font-medium">Reason: {req.rejectionReason}</p>
                    )}
                  </div>
                  <div className="text-xs opacity-60 shrink-0 text-right ml-4">
                    <p>{new Date(req.requestedAt).toLocaleDateString('en-GH')}</p>
                    <p>{new Date(req.requestedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</p>
                    {req.approvedAt && (
                      <p className="text-green-700 font-semibold mt-0.5">
                        {req.status === 'APPROVED' ? 'Approved' : 'Resolved'} {new Date(req.approvedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Till statement */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {viewMode === 'period'
                ? `Statement — ${new Date(periodStart + 'T12:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })} – ${new Date(periodEnd + 'T12:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : isHistorical
                  ? `Statement — ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : "Today's Till Statement"}
            </CardTitle>
            <span className="text-sm text-gray-500">{statement.length} entries</span>
          </div>
        </CardHeader>
        <CardContent>
          {statement.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-2.5 px-4 text-gray-600 font-semibold">{viewMode === 'period' ? 'Date' : 'Time'}</th>
                    <th className="text-left py-2.5 px-4 text-gray-600 font-semibold">Type</th>
                    <th className="text-left py-2.5 px-4 text-gray-600 font-semibold">Description</th>
                    <th className="text-right py-2.5 px-4 text-gray-600 font-semibold">Cash In</th>
                    <th className="text-right py-2.5 px-4 text-gray-600 font-semibold">Cash Out</th>
                    <th className="text-right py-2.5 px-4 text-gray-600 font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {statement.map((entry: TillStatementEntry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-4 text-gray-500 text-xs font-mono">
                        {viewMode === 'period'
                          ? new Date(entry.entryDate ?? entry.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })
                          : new Date(entry.createdAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          entry.entryType === 'DISBURSEMENT' ? 'bg-orange-100 text-orange-800' :
                          entry.entryType === 'TRANSFER' && entry.isDebit ? 'bg-blue-100 text-blue-800' :
                          entry.entryType === 'TRANSFER' ? 'bg-violet-100 text-violet-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {entry.entryType === 'DISBURSEMENT' ? 'Disbursement' :
                           entry.entryType === 'TRANSFER' && entry.isDebit ? 'Cash In' :
                           entry.entryType === 'TRANSFER' ? 'Return' :
                           entry.entryType}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-700 text-xs">
                        {entry.description}
                        {entry.transaction?.transactionCode && (
                          <span className="ml-1 font-mono text-blue-600 text-xs bg-blue-50 px-1 rounded">
                            {entry.transaction.transactionCode}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-blue-700 tabular-nums">
                        {entry.isDebit ? `GHS ${fmt(entry.amount)}` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-red-600 tabular-nums">
                        {!entry.isDebit ? `GHS ${fmt(entry.amount)}` : ''}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-bold tabular-nums ${entry.runningBalance < 0 ? 'text-red-700' : entry.runningBalance === 0 ? 'text-gray-400' : 'text-emerald-700'}`}>
                        GHS {fmt(entry.runningBalance)}
                      </td>
                    </tr>
                  ))}
                  {/* Closing balance row */}
                  <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                    <td colSpan={5} className="py-3 px-4 text-sm font-bold text-emerald-800">Closing Balance</td>
                    <td className="py-3 px-4 text-right text-base font-bold text-emerald-800 tabular-nums">GHS {fmt(balance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">
                {isHistorical ? 'No activity found for this date.' : 'No till activity today'}
              </p>
              {!isHistorical && (
                <p className="text-xs text-gray-400 mt-1">Load cash or receive a vault transfer to get started.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MODALS ── */}

      {/* Load Cash from External Source */}
      <Modal isOpen={showLoad} onClose={() => { setShowLoad(false); setUseDenomCalc(false); }} title="Load Cash into Till" size="md">
        <form onSubmit={handleLoadExternal} className="space-y-4">
          <p className="text-sm text-gray-600">Record cash received from a bank withdrawal, physical delivery, or agent deposit.</p>
          {loadError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{loadError}</div>}

          <Select
            id="load-source"
            label="Source"
            value={loadSource}
            onChange={(e) => setLoadSource(e.target.value)}
            options={[
              { value: 'BANK_WITHDRAWAL', label: 'Bank Withdrawal' },
              { value: 'CASH_BROUGHT_IN', label: 'Cash Brought In' },
              { value: 'AGENT_DEPOSIT', label: 'Agent Deposit' },
              { value: 'OTHER', label: 'Other' },
            ]}
          />

          {/* Toggle: manual or denom calc */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setUseDenomCalc(false)}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${!useDenomCalc ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              Enter Amount
            </button>
            <button
              type="button"
              onClick={() => setUseDenomCalc(true)}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${useDenomCalc ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              Count Denominations
            </button>
          </div>

          {useDenomCalc ? (
            <DenominationCalculator onTotal={(t) => setLoadAmount(t > 0 ? t.toFixed(2) : '')} />
          ) : (
            <Input
              id="load-amount"
              label="Amount (GHS)"
              type="number"
              step="0.01"
              min="0.01"
              value={loadAmount}
              onChange={(e) => setLoadAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          )}

          {loadAmount && parseFloat(loadAmount) > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
              <span className="text-sm text-emerald-700">Amount to load</span>
              <span className="text-base font-bold text-emerald-800">GHS {fmt(parseFloat(loadAmount))}</span>
            </div>
          )}

          <div>
            <label htmlFor="load-notes" className="block text-sm font-medium text-gray-700 mb-1">Reference / Notes (optional)</label>
            <textarea
              id="load-notes"
              value={loadNotes}
              onChange={(e) => setLoadNotes(e.target.value)}
              rows={2}
              placeholder="e.g. GCB withdrawal ref #12345"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setShowLoad(false); setUseDenomCalc(false); }}>Cancel</Button>
            <Button type="submit" isLoading={loadSubmitting} disabled={!loadAmount || parseFloat(loadAmount) <= 0}>
              Load GHS {loadAmount && parseFloat(loadAmount) > 0 ? fmt(parseFloat(loadAmount)) : '0.00'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Request Vault Transfer */}
      <Modal isOpen={showVaultLoad} onClose={() => setShowVaultLoad(false)} title="Request Vault Transfer" size="sm">
        <form onSubmit={handleVaultLoad} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>Approval required.</strong> This request will be reviewed by a receiving admin before funds are transferred to your till.
          </div>
          {vaultError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{vaultError}</div>}
          {vaults.length > 0 ? (
            <>
              <Select
                id="vault-select"
                label="Select Vault"
                value={vaultId}
                onChange={(e) => setVaultId(e.target.value)}
                options={vaults.map((v) => ({
                  value: v.id,
                  label: `${v.accountName} — GHS ${fmt(Number(v.balance))}`,
                }))}
              />
              <Input
                id="vault-amount"
                label="Amount Requested (GHS)"
                type="number"
                step="0.01"
                min="0.01"
                value={vaultAmount}
                onChange={(e) => setVaultAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              <div>
                <label htmlFor="vault-notes" className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <textarea
                  id="vault-notes"
                  value={vaultNotes}
                  onChange={(e) => setVaultNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Running low, need top-up for afternoon payments"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="secondary" type="button" onClick={() => setShowVaultLoad(false)}>Cancel</Button>
                <Button type="submit" isLoading={vaultSubmitting}>Submit Request</Button>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">No vaults available at this branch.</p>
          )}
        </form>
      </Modal>

      {/* Return Cash to Vault */}
      <Modal isOpen={showReturn} onClose={() => setShowReturn(false)} title="Request Cash Return to Vault" size="sm">
        <form onSubmit={handleReturn} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>Approval required.</strong> A receiving admin will review this request before the cash is moved from your till.
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
            <span className="text-sm text-gray-600">Current till balance</span>
            <span className={`font-bold text-base ${balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>GHS {fmt(balance)}</span>
          </div>
          {returnError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{returnError}</div>}
          {vaults.length > 0 ? (
            <>
              <Select
                id="return-vault-select"
                label="Return to Vault"
                value={returnVaultId}
                onChange={(e) => setReturnVaultId(e.target.value)}
                options={vaults.map((v) => ({
                  value: v.id,
                  label: `${v.accountName} — GHS ${fmt(Number(v.balance))}`,
                }))}
              />
              <Input
                id="return-amount"
                label="Amount to Return (GHS)"
                type="number"
                step="0.01"
                min="0.01"
                max={balance}
                value={returnAmount}
                onChange={(e) => setReturnAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              <div>
                <label htmlFor="return-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  id="return-notes"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="secondary" type="button" onClick={() => setShowReturn(false)}>Cancel</Button>
                <Button type="submit" isLoading={returnSubmitting}>Submit Request</Button>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">No vaults available at this branch.</p>
          )}
        </form>
      </Modal>
    </div>
  );
}
