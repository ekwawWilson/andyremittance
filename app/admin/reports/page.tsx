'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, DashboardStats, ReceivingPoint, User, AgentReport, Transaction } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { TransactionStatusBadge } from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { fmtCAD, fmtGHS, fmtNum } from '@/lib/utils/format';

type ReportTab = 'overview' | 'by-agent' | 'individual' | 'payment-methods';

function IndividualStatement({ txId }: { txId: string }) {
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    apiClient.getTransaction(txId).then((res) => { if (res.success && res.data) setTx(res.data); setLoading(false); });
  }, [txId]);
  if (loading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>;
  if (!tx) return <Card><CardContent><p className="text-gray-500 text-center py-6">Transaction not found</p></CardContent></Card>;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Transaction — <span className="font-mono text-blue-600">{tx.transactionCode}</span></CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><p className="text-gray-500">Sender</p><p className="font-medium">{tx.sender?.firstName} {tx.sender?.lastName}</p></div>
            <div><p className="text-gray-500">Receiver</p><p className="font-medium">{tx.receiver?.firstName} {tx.receiver?.lastName}</p></div>
            <div><p className="text-gray-500">Status</p><TransactionStatusBadge status={tx.status} /></div>
            <div><p className="text-gray-500">CAD</p><p className="font-medium">{fmtCAD(Number(tx.cadAmount))}</p></div>
            <div><p className="text-gray-500">GHS</p><p className="font-medium">{fmtGHS(Number(tx.ghsAmount))}</p></div>
            <div><p className="text-gray-500">Rate</p><p className="font-medium">{Number(tx.exchangeRateUsed).toFixed(4)}</p></div>
            <div><p className="text-gray-500">Payment</p><p className="font-medium">{tx.paymentMethod?.replace('_', '-')}</p></div>
            <div><p className="text-gray-500">Mode</p><p className="font-medium">{tx.receivingMode}</p></div>
            <div><p className="text-gray-500">Branch</p><p className="font-medium">{tx.receivingPoint?.name}</p></div>
            <div><p className="text-gray-500">Created By</p><p className="font-medium">{tx.createdBy?.firstName} {tx.createdBy?.lastName}</p></div>
            <div><p className="text-gray-500">Created</p><p className="font-medium">{new Date(tx.createdAt).toLocaleDateString()}</p></div>
            {tx.paidByName && <div><p className="text-gray-500">Paid By</p><p className="font-medium">{tx.paidByName}</p></div>}
          </div>
        </CardContent>
      </Card>
      {tx.ledgerEntries?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Ledger Entries</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Date</th><th className="text-left py-2 text-gray-500">Type</th><th className="text-left py-2 text-gray-500">Debit</th><th className="text-left py-2 text-gray-500">Credit</th><th className="text-right py-2 text-gray-500">Amount</th></tr></thead>
              <tbody>
                {tx.ledgerEntries.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-600">{new Date(e.entryDate).toLocaleDateString()}</td>
                    <td className="py-2 text-gray-700">{e.entryType}</td>
                    <td className="py-2 text-gray-600">{e.debitAccount?.accountName}</td>
                    <td className="py-2 text-gray-600">{e.creditAccount?.accountName}</td>
                    <td className="py-2 text-right font-semibold">{e.currency} {fmtNum(Number(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ReportTab>('overview');
  const [points, setPoints] = useState<ReceivingPoint[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [selectedPoint, setSelectedPoint] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedTxId, setSelectedTxId] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agentReport, setAgentReport] = useState<AgentReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const canViewAgentReports = user && (['SUPER_ADMIN', 'ADMIN'].includes(user.role) || user.permissions?.includes('VIEW_AGENT_REPORTS'));
  const canViewPaymentReports = user && (['SUPER_ADMIN', 'ADMIN'].includes(user.role) || user.permissions?.includes('VIEW_PAYMENT_REPORTS'));

  useEffect(() => {
    apiClient.getReceivingPoints().then((res) => { if (res.success && res.data) setPoints(res.data); });
    apiClient.getUsers({ role: 'SENDING_AGENT' }).then((res) => { if (res.success && res.data) setAgents(res.data.users); });
  }, []);

  useEffect(() => {
    if (tab === 'overview') {
      setIsLoading(true);
      apiClient.getDashboardStats(selectedPoint || undefined).then((res) => { if (res.success && res.data) setStats(res.data); setIsLoading(false); });
    }
  }, [tab, selectedPoint]);

  useEffect(() => {
    if (tab === 'by-agent' || tab === 'payment-methods') {
      setIsLoading(true);
      apiClient.getAgentReport({ agentId: selectedAgent || undefined, startDate, endDate }).then((res) => {
        if (res.success && res.data) setAgentReport(res.data);
        setIsLoading(false);
      });
    }
  }, [tab, selectedAgent, startDate, endDate]);

  const tabs: { id: ReportTab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'by-agent', label: 'By Agent', show: !!canViewAgentReports },
    { id: 'individual', label: 'Transaction Statement', show: true },
    { id: 'payment-methods', label: 'Payment Methods', show: !!canViewPaymentReports },
  ];

  const s = stats?.summary;

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Reports</h1>
      <div className="flex gap-1 mb-6 border-b">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === t.id ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <Card className="mb-6"><CardContent>
            <Select id="branch-filter" label="Filter by Branch" value={selectedPoint} onChange={(e) => setSelectedPoint(e.target.value)}
              options={[{ value: '', label: 'All Branches' }, ...points.map((p) => ({ value: p.id, label: p.name }))]} />
          </CardContent></Card>
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Total</p><p className="text-2xl font-bold mt-1">{s?.totalTransactions ?? 0}</p></CardContent></Card>
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Paid</p><p className="text-2xl font-bold text-green-600 mt-1">{s?.paidTransactions ?? 0}</p></CardContent></Card>
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Total CAD</p><p className="text-2xl font-bold text-blue-600 mt-1">{Number(s?.totalCAD ?? 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })}</p></CardContent></Card>
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Total GHS</p><p className="text-2xl font-bold text-purple-600 mt-1">GHS {Number(s?.totalGHS ?? 0).toLocaleString()}</p></CardContent></Card>
              </div>
              <Card className="mb-6"><CardHeader><CardTitle>Status Breakdown</CardTitle></CardHeader><CardContent>
                <div className="space-y-3">
                  {[{ label: 'Pending', count: s?.pendingTransactions ?? 0, color: 'bg-yellow-400' }, { label: 'Synced', count: s?.syncedTransactions ?? 0, color: 'bg-blue-400' }, { label: 'Paid', count: s?.paidTransactions ?? 0, color: 'bg-green-400' }, { label: 'Cancelled', count: s?.cancelledTransactions ?? 0, color: 'bg-red-400' }].map((item) => {
                    const pct = Math.round((item.count / (s?.totalTransactions || 1)) * 100);
                    return (<div key={item.label}><div className="flex justify-between text-sm mb-1"><span className="text-gray-700 font-medium">{item.label}</span><span className="text-gray-500">{item.count} ({pct}%)</span></div><div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`${item.color} h-2.5 rounded-full`} style={{ width: `${pct}%` }}></div></div></div>);
                  })}
                </div>
              </CardContent></Card>
              <Card><CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader><CardContent>
                {stats?.recentTransactions?.length ? (
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-3 px-4 text-gray-500">Code</th><th className="text-left py-3 px-4 text-gray-500">Sender</th><th className="text-left py-3 px-4 text-gray-500">Receiver</th><th className="text-left py-3 px-4 text-gray-500">CAD</th><th className="text-left py-3 px-4 text-gray-500">Branch</th><th className="text-left py-3 px-4 text-gray-500">Status</th></tr></thead>
                    <tbody>{stats.recentTransactions.map((t) => (<tr key={t.id} className="border-b last:border-0 hover:bg-gray-50"><td className="py-3 px-4 font-mono text-blue-600 text-xs">{t.transactionCode}</td><td className="py-3 px-4 text-gray-700">{t.sender?.firstName} {t.sender?.lastName}</td><td className="py-3 px-4 text-gray-700">{t.receiver?.firstName} {t.receiver?.lastName}</td><td className="py-3 px-4">{fmtCAD(Number(t.cadAmount))}</td><td className="py-3 px-4 text-gray-600">{t.receivingPoint?.name}</td><td className="py-3 px-4"><TransactionStatusBadge status={t.status} /></td></tr>))}</tbody>
                  </table></div>
                ) : <p className="text-gray-500 text-center py-6">No transactions</p>}
              </CardContent></Card>
            </>
          )}
        </>
      )}

      {tab === 'by-agent' && (
        <>
          <Card className="mb-6"><CardContent>
            <div className="flex gap-4 items-end flex-wrap">
              <div className="w-64"><Select id="agent-filter" label="Agent" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}
                options={[{ value: '', label: 'All Agents' }, ...agents.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}` }))]} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">From</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">To</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none" /></div>
            </div>
          </CardContent></Card>
          {isLoading ? (<div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>) : agentReport ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Transactions</p><p className="text-2xl font-bold mt-1">{agentReport.summary.totalTransactions}</p></CardContent></Card>
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Total CAD</p><p className="text-2xl font-bold text-green-600 mt-1">{fmtCAD(Number(agentReport.summary.totalCAD))}</p></CardContent></Card>
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Total GHS</p><p className="text-2xl font-bold text-purple-600 mt-1">{fmtGHS(Number(agentReport.summary.totalGHS))}</p></CardContent></Card>
                <Card><CardContent><p className="text-xs text-gray-500 uppercase">Statuses</p><p className="text-sm font-medium text-gray-700 mt-1">{agentReport.summary.byStatus.map((b) => `${b.status}: ${b.count}`).join(' · ')}</p></CardContent></Card>
              </div>
              <Card className="mb-6"><CardHeader><CardTitle>Transactions by Agent</CardTitle></CardHeader><CardContent>
                {agentReport.transactions.length ? (<div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-3 px-4 text-gray-500">Code</th><th className="text-left py-3 px-4 text-gray-500">Agent</th><th className="text-left py-3 px-4 text-gray-500">Sender</th><th className="text-left py-3 px-4 text-gray-500">Receiver</th><th className="text-left py-3 px-4 text-gray-500">CAD</th><th className="text-left py-3 px-4 text-gray-500">Branch</th><th className="text-left py-3 px-4 text-gray-500">Status</th></tr></thead>
                  <tbody>{agentReport.transactions.map((t) => (<tr key={t.id} className="border-b last:border-0 hover:bg-gray-50"><td className="py-3 px-4 font-mono text-blue-600 text-xs">{t.transactionCode}</td><td className="py-3 px-4 text-gray-600">{(t as any).createdBy?.firstName} {(t as any).createdBy?.lastName}</td><td className="py-3 px-4 text-gray-700">{t.sender?.firstName} {t.sender?.lastName}</td><td className="py-3 px-4 text-gray-700">{t.receiver?.firstName} {t.receiver?.lastName}</td><td className="py-3 px-4">{fmtCAD(Number(t.cadAmount))}</td><td className="py-3 px-4 text-gray-600">{t.receivingPoint?.name}</td><td className="py-3 px-4"><TransactionStatusBadge status={t.status} /></td></tr>))}</tbody>
                </table></div>) : <p className="text-gray-500 text-center py-6">No transactions</p>}
              </CardContent></Card>
              <Card><CardHeader><CardTitle>By Branch</CardTitle></CardHeader><CardContent>
                <table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Branch</th><th className="text-right py-2 text-gray-500">Txns</th><th className="text-right py-2 text-gray-500">CAD</th><th className="text-right py-2 text-gray-500">GHS</th></tr></thead>
                <tbody>{agentReport.byBranch.map((b) => (<tr key={b.name} className="border-b last:border-0"><td className="py-2 text-gray-700">{b.name}</td><td className="py-2 text-right">{b.count}</td><td className="py-2 text-right">{fmtCAD(b.totalCAD)}</td><td className="py-2 text-right">{fmtGHS(b.totalGHS)}</td></tr>))}</tbody>
                </table>
              </CardContent></Card>
            </>
          ) : <p className="text-gray-500">No data</p>}
        </>
      )}

      {tab === 'individual' && (
        <>
          <Card className="mb-6"><CardContent>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transaction ID</label>
            <input type="text" placeholder="Paste transaction ID…" value={selectedTxId} onChange={(e) => setSelectedTxId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none" />
          </CardContent></Card>
          {selectedTxId ? <IndividualStatement txId={selectedTxId} /> : <Card><CardContent><p className="text-gray-500 text-center py-8">Enter a transaction ID above</p></CardContent></Card>}
        </>
      )}

      {tab === 'payment-methods' && (
        <>
          <Card className="mb-6"><CardContent>
            <div className="flex gap-4 items-end flex-wrap">
              <div className="w-64"><Select id="pm-agent" label="Agent" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}
                options={[{ value: '', label: 'All Agents' }, ...agents.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}` }))]} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">From</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">To</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none" /></div>
            </div>
          </CardContent></Card>
          {isLoading ? (<div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>) : agentReport ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card><CardHeader><CardTitle>Payment Methods (Canada)</CardTitle></CardHeader><CardContent>
                {agentReport.byPaymentMethod.length ? (<table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Method</th><th className="text-right py-2 text-gray-500">Txns</th><th className="text-right py-2 text-gray-500">CAD</th></tr></thead>
                <tbody>{agentReport.byPaymentMethod.map((p) => (<tr key={p.method} className="border-b last:border-0"><td className="py-2 font-medium">{p.method.replace('_', '-')}</td><td className="py-2 text-right">{p.count}</td><td className="py-2 text-right font-semibold">{fmtCAD(p.totalCAD)}</td></tr>))}</tbody></table>) : <p className="text-gray-400 text-sm">No data</p>}
              </CardContent></Card>
              <Card><CardHeader><CardTitle>Receiving Modes (Ghana)</CardTitle></CardHeader><CardContent>
                {agentReport.byReceivingMode.length ? (<table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Mode</th><th className="text-right py-2 text-gray-500">Txns</th><th className="text-right py-2 text-gray-500">GHS</th></tr></thead>
                <tbody>{agentReport.byReceivingMode.map((m) => (<tr key={m.mode} className="border-b last:border-0"><td className="py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.mode === 'CASH' ? 'bg-green-100 text-green-700' : m.mode === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{m.mode}</span></td><td className="py-2 text-right">{m.count}</td><td className="py-2 text-right font-semibold">{fmtGHS(m.totalGHS)}</td></tr>))}</tbody></table>) : <p className="text-gray-400 text-sm">No data</p>}
              </CardContent></Card>
            </div>
          ) : <p className="text-gray-500">No data</p>}
        </>
      )}
    </div>
  );
}
