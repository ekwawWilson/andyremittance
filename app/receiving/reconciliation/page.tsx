'use client';
import { useEffect, useState } from 'react';
import { apiClient, Reconciliation, TillStatus } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingServerDate } from '@/lib/hooks/useReceivingServerDate';

function fmt(n: number) {
  return Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const GHS_DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.01];

const VARIANCE_THRESHOLD = 1.00; // GHS — warn when |variance| > this

function DenomRow({
  denom,
  count,
  onChange,
}: {
  denom: number;
  count: string;
  onChange: (val: string) => void;
}) {
  const qty = parseFloat(count) || 0;
  const sub = denom * qty;
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm font-semibold text-gray-700 w-16 shrink-0">
        GHS {denom >= 1 ? denom : denom.toFixed(2)}
      </span>
      <input
        type="number"
        min="0"
        step="1"
        value={count}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
      />
      <span className="text-xs text-gray-400">&times;</span>
      <span className={`text-sm font-medium flex-1 text-right tabular-nums ${sub > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
        {sub > 0 ? `GHS ${fmt(sub)}` : '—'}
      </span>
    </div>
  );
}

function ReconciliationBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: 'bg-emerald-100 text-emerald-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-red-100 text-red-800',
    PENDING: 'bg-amber-100 text-amber-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

export default function ReconciliationPage() {
  const { user } = useAuth();
  const { serverDate } = useReceivingServerDate();
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tillStatus, setTillStatus] = useState<TillStatus | null>(null);
  const [notes, setNotes] = useState('');

  // Denomination count for actual closing
  const [showDenomCount, setShowDenomCount] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});
  const [manualActual, setManualActual] = useState('');

  const fetchRecons = () => {
    apiClient.getReconciliations({ receivingPointId: user?.receivingPoint?.id }).then((res) => {
      if (res.success && res.data) setReconciliations(res.data);
    });
  };

  const prefillFromTill = async () => {
    const res = await apiClient.getTillStatus();
    if (res.success && res.data) {
      if (res.data.todayReconciliation && res.data.todayReconciliation.status !== 'REJECTED') {
        setTillStatus(res.data);
        setShowForm(false);
        setError('Today\'s reconciliation has already been submitted.');
        return;
      }
      setTillStatus(res.data);
      return;
    }
    setTillStatus(null);
    setError(res.error || 'Failed to derive your till ledger figures');
  };

  useEffect(() => {
    if (user) {
      fetchRecons();
    }
  }, [user]);

  const ledgerStatement = tillStatus?.statement ?? [];
  const openingBalance = Number(tillStatus?.priorClosing?.amount ?? 0);
  const cashInflows = ledgerStatement
    .filter((entry) => entry.entryType === 'TRANSFER' && entry.isDebit)
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const paymentsMade = ledgerStatement
    .filter((entry) => entry.entryType === 'DISBURSEMENT')
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const returnsToVault = ledgerStatement
    .filter((entry) => entry.entryType === 'TRANSFER' && !entry.isDebit)
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  const denomTotal = GHS_DENOMS.reduce((sum, d) => sum + d * (parseFloat(denomCounts[d] || '0') || 0), 0);
  const actualClosing = showDenomCount ? denomTotal : parseFloat(manualActual) || 0;
  const expectedClosing = openingBalance + cashInflows - paymentsMade - returnsToVault;
  const variance = actualClosing - expectedClosing;
  const hasVariance = Math.abs(variance) > 0.001;
  const isOverThreshold = Math.abs(variance) > VARIANCE_THRESHOLD;

  const openForm = async () => {
    setShowForm(true);
    setError('');
    setManualActual('');
    setDenomCounts({});
    setNotes('');
    setShowDenomCount(false);
    await prefillFromTill();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const res = await apiClient.submitReconciliation({
      reconciliationDate: serverDate,
      actualClosing,
      notes: notes || undefined,
    });
    if (res.success) {
      setShowForm(false);
      fetchRecons();
    } else {
      setError(res.error || 'Failed to submit reconciliation');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Teller Reconciliation</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-sm text-gray-500">Daily cash count and variance reporting</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700">
              <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(serverDate + 'T12:00:00').toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
        {!showForm && (
          <Button onClick={openForm}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Reconciliation
          </Button>
        )}
      </div>

      {/* Reconciliation form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>End-of-Day Cash Count</CardTitle>
              {tillStatus && (
                <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                  Pre-filled from till ledger
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
              )}

              {/* Section 1: Ledger figures */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Ledger Figures</p>
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    Server-validated
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    id="ob"
                    label="Opening Balance (GHS)"
                    type="number"
                    step="0.01"
                    value={openingBalance.toFixed(2)}
                    disabled
                  />
                  <Input
                    id="vti"
                    label="Cash / Transfers In (GHS)"
                    type="number"
                    step="0.01"
                    value={cashInflows.toFixed(2)}
                    disabled
                  />
                  <Input
                    id="pm"
                    label="Payments Made / Disbursed (GHS)"
                    type="number"
                    step="0.01"
                    value={paymentsMade.toFixed(2)}
                    disabled
                  />
                  <Input
                    id="rtv"
                    label="Returns to Vault (GHS)"
                    type="number"
                    step="0.01"
                    value={returnsToVault.toFixed(2)}
                    disabled
                  />
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  These figures come from your till ledger for today. Only the physical cash count is entered manually.
                </p>
              </div>

              {/* Expected closing summary */}
              <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Expected Closing Balance</p>
                  <p className="text-base font-bold text-gray-700 mt-0.5">
                    {openingBalance.toFixed(2)} + {cashInflows.toFixed(2)} − {paymentsMade.toFixed(2)} − {returnsToVault.toFixed(2)}
                  </p>
                </div>
                <span className="text-xl font-bold text-gray-900">GHS {fmt(expectedClosing)}</span>
              </div>

              {/* Section 2: Physical cash count */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Physical Cash Count</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDenomCount(false)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${!showDenomCount ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    >
                      Manual Entry
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDenomCount(true)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showDenomCount ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    >
                      Count Denominations
                    </button>
                  </div>
                </div>

                {showDenomCount ? (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-semibold text-gray-600">Count each denomination in your till</p>
                        <button
                          type="button"
                          onClick={() => setDenomCounts({})}
                          className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                        >
                          Clear all
                        </button>
                      </div>
                    </div>
                    {GHS_DENOMS.map((d) => (
                      <DenomRow
                        key={d}
                        denom={d}
                        count={denomCounts[d] || ''}
                        onChange={(val) => setDenomCounts((prev) => ({ ...prev, [d]: val }))}
                      />
                    ))}
                    <div className="bg-emerald-50 border-t border-emerald-200 px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-bold text-emerald-800">Total Physical Count</span>
                      <span className="text-xl font-bold text-emerald-700">GHS {fmt(denomTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <Input
                    id="ac"
                    label="Actual Closing Balance (GHS) — physical count"
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualActual}
                    onChange={(e) => setManualActual(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                )}
              </div>

              {/* Variance display */}
              {(showDenomCount ? denomTotal > 0 : manualActual !== '') && (
                <div className={`p-4 rounded-xl border ${
                  !hasVariance
                    ? 'bg-emerald-50 border-emerald-200'
                    : isOverThreshold
                    ? 'bg-red-50 border-red-300'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`text-sm font-bold ${!hasVariance ? 'text-emerald-800' : isOverThreshold ? 'text-red-800' : 'text-amber-800'}`}>
                        {!hasVariance ? 'Balanced' : isOverThreshold ? 'Variance Exceeds Threshold' : 'Minor Variance'}
                      </p>
                      <p className={`text-xs mt-0.5 ${!hasVariance ? 'text-emerald-600' : isOverThreshold ? 'text-red-700' : 'text-amber-700'}`}>
                        {!hasVariance
                          ? 'Physical count matches the till ledger. This reconciliation will be completed automatically.'
                          : isOverThreshold
                          ? `Variance of GHS ${fmt(Math.abs(variance))} exceeds the GHS ${fmt(VARIANCE_THRESHOLD)} threshold. A note is required and supervisor approval will be needed.`
                          : `Variance of GHS ${fmt(Math.abs(variance))}. Supervisor approval will be required before branch EOD can close.`}
                      </p>
                    </div>
                    <span className={`text-xl font-bold tabular-nums ${!hasVariance ? 'text-emerald-700' : isOverThreshold ? 'text-red-700' : 'text-amber-700'}`}>
                      {variance > 0 ? '+' : ''}{fmt(variance)}
                    </span>
                  </div>
                  {variance > 0 && (
                    <p className="text-xs mt-2 font-medium text-gray-600">
                      &uarr; <strong>Overage:</strong> You have more cash than expected.
                    </p>
                  )}
                  {variance < 0 && (
                    <p className="text-xs mt-2 font-medium text-gray-600">
                      &darr; <strong>Shortage:</strong> You have less cash than expected.
                    </p>
                  )}
                </div>
              )}

              {/* Notes — required if variance over threshold */}
              <div>
                <label htmlFor="recon-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes {isOverThreshold ? <span className="text-red-600">*</span> : '(optional)'}
                </label>
                <textarea
                  id="recon-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  required={isOverThreshold}
                  placeholder={isOverThreshold ? 'Explain the variance...' : 'Any additional notes...'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Sign-off confirmation */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <input
                  type="checkbox"
                  id="confirm-recon"
                  required
                  className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="confirm-recon" className="text-sm text-blue-800 cursor-pointer">
                  I confirm that the physical cash count entered above is accurate. I understand the ledger figures are system-derived and any variance will require supervisor review.
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" isLoading={isSubmitting} disabled={!tillStatus}>
                  Submit Reconciliation
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation History</CardTitle>
        </CardHeader>
        <CardContent>
          {reconciliations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Date</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Opening</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Transfers In</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Disbursed</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Returned</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Expected</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Actual</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-semibold">Variance</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reconciliations.map((r) => {
                    const v = Number(r.variance);
                    const overThresh = Math.abs(v) > VARIANCE_THRESHOLD;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-700 font-medium">
                          {new Date(r.reconciliationDate).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">GHS {fmt(Number(r.openingBalance))}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">GHS {fmt(Number(r.vaultTransfersIn))}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">GHS {fmt(Number(r.paymentsMade))}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">GHS {fmt(Number(r.returnsToVault ?? 0))}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-700 font-medium">GHS {fmt(Number(r.expectedClosing))}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-700 font-medium">GHS {fmt(Number(r.actualClosing))}</td>
                        <td className={`py-3 px-4 text-right tabular-nums font-semibold ${v === 0 ? 'text-emerald-600' : overThresh ? 'text-red-600' : 'text-amber-600'}`}>
                          {v > 0 ? '+' : ''}{fmt(v)}
                        </td>
                        <td className="py-3 px-4">
                          <ReconciliationBadge status={r.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">No reconciliation records yet</p>
              <p className="text-xs text-gray-400 mt-1">Submit your first end-of-day reconciliation above.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
