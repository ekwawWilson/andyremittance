'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, AgentReport } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ExportButtons from '@/components/ui/ExportButtons';
import { fmtCAD, fmtGHS } from '@/lib/utils/format';

interface AgentOption { id: string; firstName: string; lastName: string; }

export default function SendingReportsPage() {
  const { user } = useAuth();
  const [report, setReport] = useState<AgentReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterCodeType, setFilterCodeType] = useState('');
  const [filterPayment, setFilterPayment] = useState('');

  const canViewAll = user?.permissions?.includes('VIEW_ALL_TRANSACTIONS');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);

  // Load agent list for admin users
  useEffect(() => {
    if (!canViewAll) return;
    apiClient.getUsers({ role: 'SENDING_AGENT' }).then((res) => {
      if (res.success && res.data) {
        const users = (res.data as { users: AgentOption[] }).users ?? [];
        setAgentOptions(users);
      }
    });
  }, [canViewAll]);

  const fetchReport = async () => {
    setIsLoading(true);
    const res = await apiClient.getAgentReport({
      startDate,
      endDate,
      includeAll: true,
      agentId: selectedAgentId || undefined,
    });
    if (res.success && res.data) setReport(res.data);
    setIsLoading(false);
  };

  useEffect(() => { fetchReport(); }, [startDate, endDate, selectedAgentId, user]);

  const selectedAgent = agentOptions.find((a) => a.id === selectedAgentId);

  const filtered = (report?.transactions ?? []).filter((t) => {
    if (filterBranch && t.receivingPoint?.name !== filterBranch) return false;
    if (filterMode && t.receivingMode !== filterMode) return false;
    if (filterCodeType && t.codeType !== filterCodeType) return false;
    if (filterPayment && t.paymentMethod !== filterPayment) return false;
    return true;
  });

  const s = {
    totalTransactions: filtered.length,
    totalCAD: filtered.reduce((sum, t) => sum + Number(t.cadAmount), 0),
    totalGHS: filtered.reduce((sum, t) => sum + Number(t.ghsAmount), 0),
    byStatus: Object.entries(
      filtered.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {})
    ).map(([status, count]) => ({ status, count })),
  };

  // Derive unique option values from the full (unfiltered) report for the selects
  const branchOptions = [...new Set((report?.transactions ?? []).map((t) => t.receivingPoint?.name).filter(Boolean))];
  const modeOptions = [...new Set((report?.transactions ?? []).map((t) => t.receivingMode))];
  const codeTypeOptions = [...new Set((report?.transactions ?? []).map((t) => t.codeType))];
  const paymentOptions = [...new Set((report?.transactions ?? []).map((t) => t.paymentMethod))];

  const exportHeaders = ['Code', 'Type', 'Sender', 'Receiver', 'CAD', 'GHS', 'Branch', 'Mode', 'Payment', 'Status'];
  const exportRows = filtered.map((t) => [
    t.transactionCode,
    t.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard',
    `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`,
    `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`,
    fmtCAD(Number(t.cadAmount)),
    fmtGHS(Number(t.ghsAmount)),
    t.receivingPoint?.name ?? '',
    t.receivingMode === 'CASH' ? 'Cash' : t.receivingMode === 'BANK' ? 'Bank' : 'MoMo',
    t.paymentMethod.replace('_', '-'),
    t.status,
  ]);
  const exportSummary = [
    { label: 'Transactions', value: String(s.totalTransactions) },
    { label: 'Total CAD', value: fmtCAD(s.totalCAD), highlight: 'green' as const },
    { label: 'Total GHS', value: `GHS ${s.totalGHS.toLocaleString()}`, highlight: 'purple' as const },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {canViewAll
              ? selectedAgent ? `Report — ${selectedAgent.firstName} ${selectedAgent.lastName}` : 'All Agents Report'
              : 'My Transactions Report'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {startDate === endDate ? startDate : `${startDate} to ${endDate}`}
          </p>
        </div>
        {!isLoading && filtered.length > 0 && (
          <ExportButtons
            title="Daily Report"
            filename={`daily-report-${selectedAgent ? selectedAgent.lastName.toLowerCase() : 'all'}-${startDate}-${endDate}`}
            headers={exportHeaders}
            rows={exportRows}
            summary={exportSummary}
            subtitle={`Date range: ${startDate} to ${endDate}${selectedAgent ? ` · Agent: ${selectedAgent.firstName} ${selectedAgent.lastName}` : ''}`}
          />
        )}
      </div>

      <Card className="mb-6">
        <CardContent>
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            {canViewAll && (
              <div className="w-full sm:w-52">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                >
                  <option value="">All Agents</option>
                  {agentOptions.map((a) => (
                    <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                  ))}
                </select>
              </div>
            )}
            <Button variant="secondary" onClick={fetchReport}>Refresh</Button>
          </div>
          <div className="flex gap-3 flex-wrap items-end mt-3 pt-3 border-t border-gray-100">
            <div className="w-full sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Receiving Branch</label>
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                <option value="">All Branches</option>
                {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Receiving Mode</label>
              <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                <option value="">All Modes</option>
                {modeOptions.map((m) => <option key={m} value={m}>{m === 'CASH' ? 'Cash' : m === 'BANK' ? 'Bank Transfer' : 'Mobile Money'}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
              <select value={filterCodeType} onChange={(e) => setFilterCodeType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                <option value="">All Types</option>
                {codeTypeOptions.map((c) => <option key={c} value={c}>{c === 'ADDITIONAL' ? 'Immediate' : 'Standard'}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                <option value="">All Methods</option>
                {paymentOptions.map((p) => <option key={p} value={p}>{p.replace('_', '-')}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent><p className="text-xs text-gray-500">Transactions</p><p className="text-xl font-semibold text-gray-900 mt-1">{s.totalTransactions}</p></CardContent></Card>
            <Card><CardContent><p className="text-xs text-gray-500">Total CAD</p><p className="text-xl font-semibold text-green-600 mt-1">{fmtCAD(s.totalCAD)}</p></CardContent></Card>
            <Card><CardContent><p className="text-xs text-gray-500">Total GHS</p><p className="text-xl font-semibold text-purple-600 mt-1">GHS {s.totalGHS.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent><p className="text-xs text-gray-500">Statuses</p><p className="text-sm font-medium text-gray-700 mt-1">{s.byStatus.map((b) => `${b.status}: ${b.count}`).join(' · ') || '—'}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
            <CardContent>
              {filtered.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      <th className="text-left py-3 px-4 text-gray-500">Code</th>
                      <th className="text-left py-3 px-4 text-gray-500">Type</th>
                      <th className="text-left py-3 px-4 text-gray-500">Sender</th>
                      <th className="text-left py-3 px-4 text-gray-500">Receiver</th>
                      <th className="text-left py-3 px-4 text-gray-500">CAD</th>
                      <th className="text-left py-3 px-4 text-gray-500">Branch</th>
                      <th className="text-left py-3 px-4 text-gray-500">Mode</th>
                      <th className="text-left py-3 px-4 text-gray-500">Payment</th>
                      <th className="text-left py-3 px-4 text-gray-500">Status</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 px-4 font-mono text-blue-600 text-xs">{t.transactionCode}</td>
                          <td className="py-3 px-4"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.codeType === 'ADDITIONAL' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{t.codeType === 'ADDITIONAL' ? 'Immediate' : 'Standard'}</span></td>
                          <td className="py-3 px-4 text-gray-700">{t.sender?.firstName} {t.sender?.lastName}</td>
                          <td className="py-3 px-4 text-gray-700">{t.receiver?.firstName} {t.receiver?.lastName}</td>
                          <td className="py-3 px-4">{fmtCAD(Number(t.cadAmount))}</td>
                          <td className="py-3 px-4 text-gray-600">{t.receivingPoint?.name}</td>
                          <td className="py-3 px-4"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.receivingMode === 'CASH' ? 'bg-green-100 text-green-700' : t.receivingMode === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{t.receivingMode === 'CASH' ? 'Cash' : t.receivingMode === 'BANK' ? 'Bank' : 'MoMo'}</span></td>
                          <td className="py-3 px-4 text-gray-600 text-xs">{t.paymentMethod.replace('_', '-')}</td>
                          <td className="py-3 px-4"><TransactionStatusBadge status={t.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-gray-500 text-center py-6">No transactions in range</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
