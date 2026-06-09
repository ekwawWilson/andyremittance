'use client';
import { useEffect, useState } from 'react';
import { apiClient, SubPaymentReportEntry } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

function fmt(n: number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

export default function SubPaymentReportPage() {
  const { user } = useAuth();
  const today = todayDate();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [subPayments, setSubPayments] = useState<SubPaymentReportEntry[]>([]);
  const [totalDisbursed, setTotalDisbursed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    const res = await apiClient.getSubPaymentReport({
      startDate: dateFrom || undefined,
      endDate: dateTo || undefined,
    });
    if (res.success && res.data) {
      setSubPayments(res.data.subPayments);
      setTotalDisbursed(res.data.totalDisbursed);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchReport(); }, [dateFrom, dateTo]);

  const handleExportPdf = () => {
    const rows = subPayments.map((sp) => `
      <tr>
        <td>${sp.transaction.transactionCode}</td>
        <td>${sp.transaction.sender?.firstName ?? ''} ${sp.transaction.sender?.lastName ?? ''}</td>
        <td>${sp.receiverName || `${sp.transaction.receiver?.firstName ?? ''} ${sp.transaction.receiver?.lastName ?? ''}`}</td>
        <td>${sp.receiverPhone || sp.transaction.receiver?.phone || '—'}</td>
        <td style="text-align:right">GHS ${fmt(Number(sp.ghsAmount))}</td>
        <td>GHS ${fmt(Number(sp.transaction.ghsAmount))}</td>
        <td>${sp.receivingMode || '—'}</td>
        <td>GHS ${fmt(Number(sp.remainingBalance ?? 0))}</td>
        <td>${sp.paidByName}</td>
        <td>${new Date(sp.paidAt).toLocaleString()}</td>
        <td>${sp.notes || '—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><title>Sub-Payment Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
        h2 { margin-bottom: 4px; font-size: 16px; }
        p { color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 7px 8px; border-bottom: 2px solid #d1d5db; font-size: 10px; text-transform: uppercase; }
        td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .summary { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h2>Sub-Payment Report</h2>
      <div class="summary">
        Branch: <strong>${user?.receivingPoint?.name || '—'}</strong> &nbsp;|&nbsp;
        Period: <strong>${dateFrom}${dateTo !== dateFrom ? ' → ' + dateTo : ''}</strong> &nbsp;|&nbsp;
        Total Disbursed: <strong>GHS ${fmt(totalDisbursed)}</strong> &nbsp;|&nbsp;
        Count: <strong>${subPayments.length}</strong> &nbsp;|&nbsp;
        Generated: ${new Date().toLocaleString()}
      </div>
      <table><thead><tr>
        <th>Code</th><th>Sender</th><th>Receiver</th><th>Phone</th>
        <th>Sub-Amount</th><th>Total GHS</th><th>Mode</th><th>Remaining</th><th>Paid By</th><th>Time</th><th>Notes</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  // Group sub-payments by transaction code for display
  const grouped = subPayments.reduce<Record<string, SubPaymentReportEntry[]>>((acc, sp) => {
    const code = sp.transaction.transactionCode;
    if (!acc[code]) acc[code] = [];
    acc[code].push(sp);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sub-Payment Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Partial disbursements per transaction</p>
        </div>
        <Button variant="secondary" onClick={handleExportPdf} disabled={subPayments.length === 0}>
          Export PDF
        </Button>
      </div>

      {/* Date filter */}
      <Card className="mb-4">
        <CardContent>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {(dateFrom !== today || dateTo !== today) && (
              <button
                onClick={() => { setDateFrom(today); setDateTo(today); }}
                className="text-xs text-gray-500 hover:text-red-600 underline whitespace-nowrap"
              >
                Reset to today
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent>
          <p className="text-xs text-gray-500 uppercase font-medium">Total Disbursed</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">GHS {fmt(totalDisbursed)}</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-gray-500 uppercase font-medium">Sub-Payments</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{subPayments.length}</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-gray-500 uppercase font-medium">Transactions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{Object.keys(grouped).length}</p>
        </CardContent></Card>
      </div>

      {/* Grouped table */}
      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : subPayments.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(grouped).map(([code, entries]) => {
                const tx = entries[0].transaction;
                const txTotal = Number(tx.ghsAmount);
                const disbursed = entries.reduce((s, sp) => s + Number(sp.ghsAmount), 0);
                const remaining = txTotal - disbursed;
                return (
                  <div key={code} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Transaction header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-blue-700 text-sm">{code}</span>
                        <span className="text-sm text-gray-600">
                          {tx.sender?.firstName} {tx.sender?.lastName} → {entries[0].receiverName || `${tx.receiver?.firstName ?? ''} ${tx.receiver?.lastName ?? ''}`.trim()}
                        </span>
                        {(entries[0].receiverPhone || tx.receiver?.phone) && <span className="text-xs text-gray-400">{entries[0].receiverPhone || tx.receiver?.phone}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-500">Total: <strong>GHS {fmt(txTotal)}</strong></span>
                        <span className="text-green-700">Paid: <strong>GHS {fmt(disbursed)}</strong></span>
                        {remaining > 0.001 && <span className="text-amber-700">Remaining: <strong>GHS {fmt(remaining)}</strong></span>}
                        {remaining <= 0.001 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Fully Paid</span>}
                      </div>
                    </div>
                    {/* Sub-payment rows */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">#</th>
                          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Receiver</th>
                          <th className="text-right py-2 px-4 text-gray-500 font-medium text-xs">GHS Amount</th>
                          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Mode</th>
                          <th className="text-right py-2 px-4 text-gray-500 font-medium text-xs">Remaining</th>
                          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Paid By</th>
                          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Time</th>
                          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((sp, i) => (
                          <tr key={sp.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2 px-4 text-gray-400 text-xs">{i + 1}</td>
                            <td className="py-2 px-4 text-gray-500 text-xs">
                              <p>{sp.receiverName || '—'}</p>
                              <p className="text-[11px] text-gray-400">{sp.receiverPhone || '—'}</p>
                            </td>
                            <td className="py-2 px-4 text-right font-semibold text-green-700">GHS {fmt(Number(sp.ghsAmount))}</td>
                            <td className="py-2 px-4 text-gray-500 text-xs">{sp.receivingMode || '—'}</td>
                            <td className="py-2 px-4 text-right text-amber-700 text-xs">GHS {fmt(Number(sp.remainingBalance ?? 0))}</td>
                            <td className="py-2 px-4 text-gray-600">{sp.paidByName}</td>
                            <td className="py-2 px-4 text-gray-500 text-xs">{new Date(sp.paidAt).toLocaleString()}</td>
                            <td className="py-2 px-4 text-gray-500 text-xs">{sp.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">No sub-payments found for the selected period.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
