'use client';
import React, { useEffect, useState, useRef } from 'react';
import { apiClient, Sender } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function SendersPage() {
  const { user } = useAuth();
  const canSync = user?.permissions?.includes('SYNC_TRANSACTIONS') ?? false;
  const [senders, setSenders] = useState<Sender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', address: '', city: '', idType: '', idNumber: '' });
  const [formError, setFormError] = useState('');
  const [pendingAdditionalCount, setPendingAdditionalCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editSender, setEditSender] = useState<Sender | null>(null);
  const [editError, setEditError] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSenders = async (q = '') => {
    setIsLoading(true);
    const res = await apiClient.getSenders({ search: q || undefined });
    if (res.success && res.data) setSenders(res.data.senders);
    setIsLoading(false);
  };

  const checkPendingAdditional = async () => {
    if (!canSync) return;
    const res = await apiClient.getPendingAdditionalSyncTransactions();
    if (res.success && res.data) {
      setPendingAdditionalCount(res.data.length);
    }
  };

  const handleSyncAdditional = async () => {
    setSyncing(true);
    const res = await apiClient.additionalSync();
    if (res.success) {
      setPendingAdditionalCount(0);
      setBannerDismissed(true);
    }
    setSyncing(false);
  };

  useEffect(() => {
    fetchSenders();
    if (user?.id && canSync) checkPendingAdditional();
  }, [user?.id, canSync]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const res = await apiClient.createSender({ ...formData, country: 'Canada' });
    if (res.success) {
      setShowModal(false);
      fetchSenders(search);
      setFormData({ firstName: '', lastName: '', email: '', phone: '', address: '', city: '', idType: '', idNumber: '' });
    } else {
      setFormError(res.error || 'Failed to create sender');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSender) return;
    setEditError('');
    const res = await apiClient.updateSender(editSender.id, {
      firstName: editSender.firstName,
      lastName: editSender.lastName,
      email: editSender.email,
      phone: editSender.phone,
      address: editSender.address,
      city: editSender.city,
      idType: editSender.idType,
      idNumber: editSender.idNumber,
    });
    if (res.success) {
      setEditSender(null);
      fetchSenders(search);
    } else {
      setEditError(res.error || 'Failed to update sender');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Senders</h1>
        <Button onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Sender
        </Button>
      </div>

      {canSync && pendingAdditionalCount > 0 && !bannerDismissed && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg">
          <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="flex-1 text-sm text-amber-800">
            <span className="font-semibold">{pendingAdditionalCount} additional (immediate) transaction{pendingAdditionalCount !== 1 ? 's' : ''}</span> pending sync.
          </p>
          <Button
            variant="secondary"
            onClick={handleSyncAdditional}
            disabled={syncing}
            className="text-sm px-3 py-1 border-amber-400 text-amber-800 hover:bg-amber-100"
          >
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
          <button onClick={() => setBannerDismissed(true)} className="text-amber-500 hover:text-amber-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <Card className="mb-4">
        <CardContent>
          <Input
            id="search-senders"
            type="text"
            placeholder="Search by name, phone, or email…"
            value={search}
            onChange={(e) => {
              const q = e.target.value;
              setSearch(q);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => fetchSenders(q), 300);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : senders.length > 0 ? (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-gray-100">
                {senders.map((s) => (
                  <div key={s.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link href={`/sending/senders/${s.id}`} className="font-semibold text-blue-600 text-sm">{s.firstName} {s.lastName}</Link>
                        <p className="text-xs text-gray-500 mt-0.5">{s.phone}{s.city ? ` · ${s.city}` : ''}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{s.receivers?.length ?? 0} receiver{(s.receivers?.length ?? 0) !== 1 ? 's' : ''} · {s._count?.transactions ?? 0} txns</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Link href={`/sending/senders/${s.id}`} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:bg-blue-100 hover:text-blue-700 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7s-8.268-2.943-9.542-7z" /></svg>
                        </Link>
                        <button onClick={() => setEditSender(s)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:bg-amber-100 hover:text-amber-700 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="w-10 py-3 px-2"></th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Phone</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Email</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">City</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Receivers</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Txns</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {senders.map((s) => {
                    const isOpen = expandedId === s.id;
                    const hasReceivers = (s.receivers?.length ?? 0) > 0;
                    return (
                      <React.Fragment key={s.id}>
                        <tr className={`border-b ${isOpen ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <td className="py-3 px-2 text-center">
                            <button
                              onClick={() => setExpandedId(isOpen ? null : s.id)}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${hasReceivers ? 'text-gray-500 hover:bg-blue-100 hover:text-blue-700' : 'text-gray-300 cursor-default'}`}
                              aria-label={isOpen ? 'Collapse receivers' : 'Expand receivers'}
                              title={hasReceivers ? undefined : 'No receivers added yet'}
                            >
                              <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </td>
                          <td className="py-3 px-4"><Link href={`/sending/senders/${s.id}`} className="text-blue-600 hover:underline font-medium">{s.firstName} {s.lastName}</Link></td>
                          <td className="py-3 px-4 text-gray-600">{s.phone}</td>
                          <td className="py-3 px-4 text-gray-600">{s.email || '—'}</td>
                          <td className="py-3 px-4 text-gray-600">{s.city || '—'}</td>
                          <td className="py-3 px-4 text-gray-600">{s.receivers?.length ?? 0}</td>
                          <td className="py-3 px-4 text-gray-600">{s._count?.transactions ?? 0}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Link href={`/sending/senders/${s.id}`} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-blue-100 hover:text-blue-700 transition-colors" aria-label="View sender">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7s-8.268-2.943-9.542-7z" /></svg>
                              </Link>
                              <button onClick={() => setEditSender(s)} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-amber-100 hover:text-amber-700 transition-colors" aria-label="Edit sender">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b bg-blue-50">
                            <td colSpan={8} className="px-4 py-3 pl-12">
                              {!hasReceivers ? (
                                <p className="text-xs text-gray-400 italic py-1">No receivers added for this sender yet.</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-blue-200">
                                      <th className="text-left py-1.5 text-gray-500 font-medium">Receiver</th>
                                      <th className="text-left py-1.5 text-gray-500 font-medium">Phone</th>
                                      <th className="text-left py-1.5 text-gray-500 font-medium">Relationship</th>
                                      <th className="text-left py-1.5 text-gray-500 font-medium">Preferred Method</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.receivers!.map((r) => (
                                      <tr key={r.id} className="border-b border-blue-100 last:border-0">
                                        <td className="py-1.5 text-gray-800 font-medium">{r.firstName} {r.lastName}</td>
                                        <td className="py-1.5 text-gray-600">{r.phone}</td>
                                        <td className="py-1.5 text-gray-600">{r.relationshipToSender || '—'}</td>
                                        <td className="py-1.5">
                                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.preferredMethod === 'CASH' ? 'bg-green-100 text-green-700' : r.preferredMethod === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                            {r.preferredMethod === 'CASH' ? 'Cash' : r.preferredMethod === 'BANK' ? 'Bank' : 'MoMo'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : <p className="text-gray-500 text-center py-8">No senders found</p>}
        </CardContent>
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New Sender">
        <form onSubmit={handleCreate} className="space-y-3">
          {formError && <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{formError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Input id="fn" label="First Name" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} required />
            <Input id="ln" label="Last Name" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} required />
          </div>
          <Input id="ph" label="Phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 416 555 1234" minLength={7} maxLength={20} required />
          <Input id="em" label="Email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          <Input id="addr" label="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          <Input id="city" label="City" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input id="idt" label="ID Type" value={formData.idType} onChange={(e) => setFormData({ ...formData, idType: e.target.value })} placeholder="Passport" />
            <Input id="idn" label="ID Number" value={formData.idNumber} onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Create Sender</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editSender} onClose={() => setEditSender(null)} title="Edit Sender">
        {editSender && (
          <form onSubmit={handleEdit} className="space-y-3">
            {editError && <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{editError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Input id="edit-fn" label="First Name" value={editSender.firstName} onChange={(e) => setEditSender({ ...editSender, firstName: e.target.value })} required />
              <Input id="edit-ln" label="Last Name" value={editSender.lastName} onChange={(e) => setEditSender({ ...editSender, lastName: e.target.value })} required />
            </div>
            <Input id="edit-ph" label="Phone" type="tel" value={editSender.phone} onChange={(e) => setEditSender({ ...editSender, phone: e.target.value })} placeholder="+1 416 555 1234" minLength={7} maxLength={20} required />
            <Input id="edit-em" label="Email" type="email" value={editSender.email || ''} onChange={(e) => setEditSender({ ...editSender, email: e.target.value })} />
            <Input id="edit-addr" label="Address" value={editSender.address || ''} onChange={(e) => setEditSender({ ...editSender, address: e.target.value })} />
            <Input id="edit-city" label="City" value={editSender.city || ''} onChange={(e) => setEditSender({ ...editSender, city: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input id="edit-idt" label="ID Type" value={editSender.idType || ''} onChange={(e) => setEditSender({ ...editSender, idType: e.target.value })} placeholder="Passport" />
              <Input id="edit-idn" label="ID Number" value={editSender.idNumber || ''} onChange={(e) => setEditSender({ ...editSender, idNumber: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={() => setEditSender(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
