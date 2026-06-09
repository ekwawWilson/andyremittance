'use client';
import { useEffect, useState } from 'react';
import { apiClient, ReceivingPoint } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface BranchUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface FullBranch extends ReceivingPoint {
  users?: BranchUser[];
  isActive?: boolean;
}

const roleBadge: Record<string, string> = {
  RECEIVING_ADMIN: 'bg-teal-100 text-teal-800',
  MANAGER:         'bg-blue-100 text-blue-800',
  TELLER:          'bg-green-100 text-green-800',
};

function fmtGHS(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceivingPointsPage() {
  const [points, setPoints] = useState<FullBranch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', code: '', address: '', city: '', phone: '' });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Edit modal
  const [editPoint, setEditPoint] = useState<FullBranch | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', city: '', phone: '' });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Staff drawer
  const [staffBranch, setStaffBranch] = useState<FullBranch | null>(null);

  const doFetch = () => {
    apiClient.getReceivingPoints().then((res) => {
      if (res.success && res.data) setPoints(res.data as FullBranch[]);
      setIsLoading(false);
    });
  };

  useEffect(() => { doFetch(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    const res = await apiClient.createReceivingPoint({ ...createForm, country: 'Ghana' });
    setCreateLoading(false);
    if (res.success) {
      setShowCreate(false);
      setCreateForm({ name: '', code: '', address: '', city: '', phone: '' });
      doFetch();
    } else {
      setCreateError(res.error || 'Failed to create branch');
    }
  };

  const openEdit = (p: FullBranch) => {
    setEditPoint(p);
    setEditForm({ name: p.name, address: p.address, city: p.city, phone: p.phone || '' });
    setEditError('');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPoint) return;
    setEditLoading(true);
    setEditError('');
    const res = await apiClient.updateReceivingPoint(editPoint.id, {
      name: editForm.name,
      address: editForm.address,
      city: editForm.city,
      phone: editForm.phone || undefined,
    });
    setEditLoading(false);
    if (res.success) {
      setEditPoint(null);
      doFetch();
    } else {
      setEditError(res.error || 'Failed to update branch');
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Branches</h1>
          <p className="text-sm text-gray-500 mt-0.5">{points.length} branch{points.length !== 1 ? 'es' : ''} configured</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setCreateError(''); }}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Branch
        </Button>
      </div>

      {/* Branch table */}
      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
            </div>
          ) : points.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">No branches yet. Create your first branch.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Branch</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Code</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Location</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Staff</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Vault Balance</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Txns</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => {
                    const vaultBalance = Number(p.vaultLedger?.[0]?.balance ?? 0);
                    const staffCount = p.users?.length ?? 0;
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-800 font-mono">
                            {p.code}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          <p>{p.address}</p>
                          <p className="text-xs text-gray-400">{p.city}, {p.country}</p>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{p.phone || '—'}</td>
                        <td className="py-3 px-4">
                          {staffCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setStaffBranch(p)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {staffCount} staff
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">No staff</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-semibold ${vaultBalance > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                            GHS {fmtGHS(vaultBalance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500">{p._count?.transactions ?? 0}</td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition-colors"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Branch Modal ─────────────────────────────────────────────── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Branch">
        <form onSubmit={handleCreate} className="space-y-3">
          {createError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{createError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Accra Main Branch"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
            <input
              value={createForm.code}
              onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })}
              placeholder="e.g. ACCRA"
              required
              maxLength={20}
              className={inputCls + ' font-mono uppercase'}
            />
            <p className="text-xs text-gray-400 mt-1">Short unique identifier. Cannot be changed later.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
            <input
              value={createForm.address}
              onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
              placeholder="123 Independence Avenue"
              required
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input
                value={createForm.city}
                onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                placeholder="Accra"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                placeholder="+233 20 123 4567"
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" isLoading={createLoading}>Create Branch</Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Branch Modal ───────────────────────────────────────────────── */}
      <Modal isOpen={!!editPoint} onClose={() => setEditPoint(null)} title={`Edit — ${editPoint?.name}`}>
        {editPoint && (
          <form onSubmit={handleEdit} className="space-y-3">
            {editError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{editError}</div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
              <span className="text-xs text-gray-500">Code</span>
              <span className="font-mono font-bold text-sm text-gray-800">{editPoint.code}</span>
              <span className="text-xs text-gray-400 ml-1">(cannot be changed)</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                required
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                <input
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={() => setEditPoint(null)}>Cancel</Button>
              <Button type="submit" isLoading={editLoading}>Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Staff Modal ─────────────────────────────────────────────────────── */}
      <Modal isOpen={!!staffBranch} onClose={() => setStaffBranch(null)} title={`Staff — ${staffBranch?.name}`} size="sm">
        {staffBranch && (
          <div>
            {(staffBranch.users ?? []).length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No staff assigned.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {(staffBranch.users ?? []).map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end pt-4">
              <Button variant="secondary" onClick={() => setStaffBranch(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
