'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, AuditLog } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

const ENTITY_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'Transaction', label: 'Transaction' },
  { value: 'User', label: 'User' },
  { value: 'LedgerEntry', label: 'Ledger Entry' },
  { value: 'Reconciliation', label: 'Reconciliation' },
  { value: 'EndOfDayRecord', label: 'End of Day Record' },
  { value: 'ReceivingPoint', label: 'Receiving Point' },
  { value: 'ExchangeRate', label: 'Exchange Rate' },
];

export default function AuditLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ entity: '', action: '', startDate: today, endDate: today });

  if (!user || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Access restricted to Admin and Super Admin.</p>
      </div>
    );
  }

  const doFetch = async (p = page) => {
    setIsLoading(true);
    const res = await apiClient.getAuditLog({
      entity: filters.entity || undefined,
      action: filters.action || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      page: p,
      limit: 50,
    });
    if (res.success && res.data) {
      setLogs(res.data.logs);
      setTotalPages(res.data.pagination.totalPages);
      setTotal(res.data.pagination.total);
    }
    setIsLoading(false);
  };

  useEffect(() => { doFetch(1); setPage(1); }, [filters]);
  useEffect(() => { doFetch(page); }, [page]);

  const handleSearch = () => { setPage(1); doFetch(1); };

  const actionBadgeColor = (action: string) => {
    if (action.startsWith('CREATE')) return 'bg-green-100 text-green-700';
    if (action.startsWith('UPDATE') || action.startsWith('EDIT')) return 'bg-blue-100 text-blue-700';
    if (action.startsWith('DELETE') || action.startsWith('CANCEL')) return 'bg-red-100 text-red-700';
    if (action.startsWith('LOGIN')) return 'bg-gray-100 text-gray-600';
    if (action.includes('APPROVE')) return 'bg-teal-100 text-teal-700';
    if (action.includes('EOD') || action.includes('SYNC')) return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Audit Log</h1>
        <span className="text-sm text-gray-500">{total.toLocaleString()} entries</span>
      </div>

      {/* Filter Bar */}
      <Card className="mb-4">
        <CardContent>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="w-full sm:w-48">
              <Select
                id="al-entity"
                label="Entity"
                value={filters.entity}
                onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
                options={ENTITY_OPTIONS}
              />
            </div>
            <div className="flex-1 min-w-48">
              <Input
                id="al-action"
                label="Action contains"
                placeholder="e.g. CREATE_TRANSACTION"
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                min={filters.startDate || undefined}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
              />
            </div>
            <Button type="button" onClick={handleSearch} size="sm">Search</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : logs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No audit log entries found for the selected filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Timestamp</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">User</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Action</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Entity</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Entity ID</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Changes</th>
                  </tr></thead>
                  <tbody>
                    {logs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          <td className="py-3 px-4 text-gray-500 whitespace-nowrap text-xs">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-gray-900 text-xs font-medium">{log.userName || log.userId || '—'}</div>
                            {log.userRole && (
                              <span className="text-xs text-gray-500">{log.userRole}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${actionBadgeColor(log.action)}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-700 text-xs">{log.entity}</td>
                          <td className="py-3 px-4 text-gray-500 font-mono text-xs truncate max-w-28">{log.entityId || '—'}</td>
                          <td className="py-3 px-4">
                            {log.changes ? (
                              <button
                                type="button"
                                className="text-xs text-blue-600 hover:underline"
                                onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === log.id ? null : log.id); }}
                              >
                                {expandedId === log.id ? 'Hide' : 'View'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                        {expandedId === log.id && log.changes && (
                          <tr key={`${log.id}-expanded`} className="border-b bg-gray-50">
                            <td colSpan={6} className="py-3 px-4">
                              <div className="rounded-lg border border-gray-200 bg-white p-3 max-w-2xl">
                                <p className="text-xs font-semibold text-gray-500 mb-2">Changes</p>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                                  {Object.entries(log.changes).map(([k, v]) => (
                                    <div key={k} className="flex gap-2">
                                      <dt className="text-xs font-medium text-gray-500 shrink-0">{k}:</dt>
                                      <dd className="text-xs text-gray-900 break-all">
                                        {v === null ? <span className="italic text-gray-400">null</span> : String(v)}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-2">
                  <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                    <Button variant="secondary" size="sm" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
