'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { apiClient, Receiver, Sender } from '@/lib/api-client';

// ─── helpers ─────────────────────────────────────────────────────────────────
function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

const METHOD_META: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  CASH: { label: 'Cash', bg: 'bg-green-100', text: 'text-green-700', icon: '💵' },
  BANK: { label: 'Bank', bg: 'bg-blue-100', text: 'text-blue-700', icon: '🏦' },
  MOMO: { label: 'MoMo', bg: 'bg-purple-100', text: 'text-purple-700', icon: '📱' },
};

function MethodBadge({ method }: { method: string }) {
  const m = METHOD_META[method] ?? { label: method, bg: 'bg-gray-100', text: 'text-gray-600', icon: '' };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.bg} ${m.text}`}>
      {m.icon} {m.label}
    </span>
  );
}

const EMPTY_FORM = {
  senderId: '', firstName: '', lastName: '', phone: '',
  idType: '', idNumber: '',
  preferredMethod: 'CASH' as 'CASH' | 'BANK' | 'MOMO',
  bankName: '', bankAccount: '', bankBranch: '',
  momoNumber: '', momoProvider: '',
};

// ─── SenderCombobox ───────────────────────────────────────────────────────────
interface SenderComboboxProps {
  value: string;
  displayName: string;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
  id: string;
  required?: boolean;
}
function SenderCombobox({ value, displayName, onSelect, onClear, id, required }: SenderComboboxProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Sender[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (search.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await apiClient.getSenders({ search, limit: 10 });
      if (res.success && res.data) setResults(res.data.senders);
      setSearching(false);
      setOpen(true);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search]);

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl bg-blue-50">
        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
          {displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <span className="text-sm font-medium text-blue-900 flex-1 truncate">{displayName}</span>
        <button type="button" onClick={onClear} className="text-blue-400 hover:text-red-500 transition-colors" aria-label="Clear sender">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input
          id={id}
          type="text"
          placeholder="Type name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          autoComplete="off"
        />
        {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {results.length > 0 ? results.map((s) => (
            <button key={s.id} type="button"
              onClick={() => { onSelect(s.id, `${s.firstName} ${s.lastName}`); setSearch(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between items-center gap-2 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold shrink-0">
                  {`${s.firstName[0]}${s.lastName[0]}`}
                </div>
                <span className="font-medium text-gray-900 truncate">{s.firstName} {s.lastName}</span>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{s.phone}</span>
            </button>
          )) : (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">No senders found</div>
          )}
        </div>
      )}
      {required && <input type="hidden" value={value} required />}
    </div>
  );
}

// ─── PaymentFields ────────────────────────────────────────────────────────────
interface PaymentFieldsProps {
  method: 'CASH' | 'BANK' | 'MOMO';
  data: typeof EMPTY_FORM;
  onChange: (patch: Partial<typeof EMPTY_FORM>) => void;
}
function PaymentFields({ method, data, onChange }: PaymentFieldsProps) {
  if (method === 'BANK') return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bank Name <span className="text-red-500">*</span></label>
          <input value={data.bankName} onChange={(e) => onChange({ bankName: e.target.value })} required
            placeholder="e.g. GCB, Ecobank" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Number <span className="text-red-500">*</span></label>
          <input value={data.bankAccount} onChange={(e) => onChange({ bankAccount: e.target.value })} required
            placeholder="e.g. 0123456789" minLength={6} maxLength={20}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Bank Branch <span className="text-red-500">*</span></label>
        <input value={data.bankBranch} onChange={(e) => onChange({ bankBranch: e.target.value })} required
          placeholder="e.g. Accra Main" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
    </div>
  );

  if (method === 'MOMO') return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">MoMo Number <span className="text-red-500">*</span></label>
        <input type="tel" value={data.momoNumber} onChange={(e) => onChange({ momoNumber: e.target.value })} required
          placeholder="+233 55 123 4567" minLength={9} maxLength={15}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Provider <span className="text-red-500">*</span></label>
        <select value={data.momoProvider} onChange={(e) => onChange({ momoProvider: e.target.value })} required
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
          <option value="">Select provider</option>
          <option value="MTN">MTN</option>
          <option value="Vodafone">Vodafone</option>
          <option value="AirtelTigo">AirtelTigo</option>
        </select>
      </div>
    </div>
  );

  return null;
}

// ─── ReceiverForm ─────────────────────────────────────────────────────────────
interface ReceiverFormProps {
  data: typeof EMPTY_FORM;
  onChange: (patch: Partial<typeof EMPTY_FORM>) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}
function ReceiverForm({ data, onChange, error, onSubmit, onCancel, submitLabel, isSubmitting }: ReceiverFormProps) {
  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {/* Sender */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Parent Sender <span className="text-red-500">*</span></label>
        <SenderCombobox id="recv-sender"
          value={data.senderId} displayName=""
          onSelect={(id) => onChange({ senderId: id })}
          onClear={() => onChange({ senderId: '' })}
          required />
      </div>

      {/* Name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">First Name <span className="text-red-500">*</span></label>
          <input value={data.firstName} onChange={(e) => onChange({ firstName: e.target.value })} required placeholder="Kwame" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Last Name <span className="text-red-500">*</span></label>
          <input value={data.lastName} onChange={(e) => onChange({ lastName: e.target.value })} required placeholder="Mensah" className={inputCls} />
        </div>
      </div>

      {/* Contact */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Phone <span className="text-red-500">*</span></label>
        <input type="tel" value={data.phone} onChange={(e) => onChange({ phone: e.target.value })} required
          placeholder="+233 20 123 4567" minLength={9} maxLength={15} className={inputCls} />
      </div>

      {/* ID */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ID Type</label>
          <select value={data.idType} onChange={(e) => onChange({ idType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
            <option value="">Select (optional)</option>
            <option value="Passport">Passport</option>
            <option value="Driver's License">Driver&apos;s License</option>
            <option value="National ID">National ID</option>
            <option value="Voter ID">Voter ID</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ID Number</label>
          <input value={data.idNumber} onChange={(e) => onChange({ idNumber: e.target.value })}
            placeholder="GHA-123456789" className={inputCls} />
        </div>
      </div>

      {/* Preferred method */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Preferred Payout Method</label>
        <div className="grid grid-cols-3 gap-2">
          {(['CASH', 'BANK', 'MOMO'] as const).map((m) => {
            const meta = METHOD_META[m];
            return (
              <button key={m} type="button"
                onClick={() => onChange({ preferredMethod: m, bankName: '', bankAccount: '', bankBranch: '', momoNumber: '', momoProvider: '' })}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${data.preferredMethod === m ? `${meta.bg} ${meta.text} border-current` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                <span className="text-base">{meta.icon}</span>
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment fields */}
      <PaymentFields method={data.preferredMethod} data={data} onChange={onChange} />

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting}
          className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm">
          {isSubmitting ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving…
            </span>
          ) : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReceiversPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canCreate = user?.permissions?.includes('CREATE_RECEIVERS');
  const canEdit = user?.permissions?.includes('EDIT_RECEIVERS');

  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSender, setSelectedSender] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 200;

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editReceiver, setEditReceiver] = useState<Receiver | null>(null);

  // Form state
  const [createData, setCreateData] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [createSenderName, setCreateSenderName] = useState('');
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editData, setEditData] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [editSenderName, setEditSenderName] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Search debounce
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReceivers = useCallback(async (q: string, sid: string, pg: number) => {
    setIsLoading(true);
    const res = await apiClient.getReceivers({
      senderId: sid || undefined,
      search: q || undefined,
    });
    if (res.success && res.data) {
      // API returns array or paginated object
      if (Array.isArray(res.data)) {
        setReceivers(res.data);
        setTotal(res.data.length);
      } else {
        const d = res.data as { receivers?: Receiver[]; total?: number };
        setReceivers(d.receivers ?? (res.data as unknown as Receiver[]));
        setTotal(d.total ?? 0);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    apiClient.getSenders({ limit: 200 }).then((res) => { if (res.success && res.data) setSenders(res.data.senders); });
    fetchReceivers('', '', 1);
  }, [fetchReceivers]);

  const handleSearchChange = (q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchReceivers(q, selectedSender, 1); }, 300);
  };

  const handleSenderFilter = (sid: string) => {
    setSelectedSender(sid);
    setPage(1);
    fetchReceivers(search, sid, 1);
  };

  const openCreate = () => {
    setCreateData({ ...EMPTY_FORM });
    setCreateSenderName('');
    setCreateError('');
    setShowCreate(true);
  };

  const openEdit = (r: Receiver) => {
    setEditReceiver(r);
    setEditData({
      senderId: r.senderId ?? '',
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      idType: r.idType ?? '',
      idNumber: r.idNumber ?? '',
      preferredMethod: (r.preferredMethod as 'CASH' | 'BANK' | 'MOMO') ?? 'CASH',
      bankName: r.bankName ?? '',
      bankAccount: r.bankAccount ?? '',
      bankBranch: r.bankBranch ?? '',
      momoNumber: r.momoNumber ?? '',
      momoProvider: r.momoProvider ?? '',
    });
    setEditSenderName(r.sender ? `${r.sender.firstName} ${r.sender.lastName}` : '');
    setEditError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createData.senderId) { setCreateError('Please select a parent sender.'); return; }
    if (!createData.firstName.trim() || !createData.lastName.trim()) { setCreateError('First and last name are required.'); return; }
    if (!createData.phone.trim()) { setCreateError('Phone number is required.'); return; }
    setCreateError('');
    setCreateSubmitting(true);
    try {
      const res = await apiClient.createReceiver({
        senderId: createData.senderId,
        firstName: createData.firstName,
        lastName: createData.lastName,
        phone: createData.phone,
        preferredMethod: createData.preferredMethod,
        bankName: createData.bankName || undefined,
        bankAccount: createData.bankAccount || undefined,
        bankBranch: createData.bankBranch || undefined,
        momoNumber: createData.momoNumber || undefined,
        momoProvider: createData.momoProvider || undefined,
      });
      if (res.success) {
        setShowCreate(false);
        fetchReceivers(search, selectedSender, page);
      } else {
        setCreateError(res.error || 'Failed to create receiver. Please try again.');
      }
    } catch {
      setCreateError('Unexpected error. Please try again.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editReceiver) return;
    if (!editData.firstName.trim() || !editData.lastName.trim()) { setEditError('First and last name are required.'); return; }
    if (!editData.phone.trim()) { setEditError('Phone number is required.'); return; }
    setEditError('');
    setEditSubmitting(true);
    try {
      const res = await apiClient.updateReceiver(editReceiver.id, {
        firstName: editData.firstName,
        lastName: editData.lastName,
        phone: editData.phone,
        preferredMethod: editData.preferredMethod,
        bankName: editData.bankName || undefined,
        bankAccount: editData.bankAccount || undefined,
        bankBranch: editData.bankBranch || undefined,
        momoNumber: editData.momoNumber || undefined,
        momoProvider: editData.momoProvider || undefined,
        ...(editData.senderId ? { senderId: editData.senderId } : {}),
      });
      if (res.success) {
        setEditReceiver(null);
        fetchReceivers(search, selectedSender, page);
      } else {
        setEditError(res.error || 'Failed to update receiver. Please try again.');
      }
    } catch {
      setEditError('Unexpected error. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Receivers</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage recipient profiles for Ghana payouts</p>
        </div>
        {canCreate && (
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Receiver
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-50">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text" placeholder="Search by name or phone…"
              value={search} onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select value={selectedSender} onChange={(e) => handleSenderFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 bg-white min-w-45">
            <option value="">All Senders</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
          {(search || selectedSender) && (
            <button onClick={() => { setSearch(''); setSelectedSender(''); setPage(1); fetchReceivers('', '', 1); }}
              className="px-3 py-2.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
              Clear
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{total} receiver{total !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 gap-3">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm text-gray-400">Loading…</span>
          </div>
        ) : receivers.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">No receivers found</p>
            <p className="text-xs text-gray-400 mt-1">
              {search || selectedSender ? 'Try adjusting your filters' : 'Add the first receiver to get started'}
            </p>
            {canCreate && !search && !selectedSender && (
              <button onClick={openCreate}
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add receiver
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="text-left py-3 px-5 text-xs font-medium text-gray-400">Receiver</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Phone</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Sender</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Payout</th>
                  <th className="text-right py-3 px-5 text-xs font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receivers.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-linear-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {initials(r.firstName, r.lastName)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{r.firstName} {r.lastName}</p>
                          {r.idType && r.idNumber && (
                            <p className="text-[10px] text-gray-400">{r.idType}: {r.idNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 font-mono text-xs">{r.phone}</td>
                    <td className="py-3.5 px-4">
                      {r.sender ? (
                        <span className="text-sm text-gray-700">{r.sender.firstName} {r.sender.lastName}</span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <MethodBadge method={r.preferredMethod ?? 'CASH'} />
                        {r.preferredMethod === 'BANK' && r.bankName && (
                          <p className="text-[10px] text-gray-400 font-mono">{r.bankName} · {r.bankAccount}</p>
                        )}
                        {r.preferredMethod === 'MOMO' && r.momoNumber && (
                          <p className="text-[10px] text-gray-400 font-mono">{r.momoNumber}{r.momoProvider ? ` · ${r.momoProvider}` : ''}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => router.push(`/sending/receivers/${r.id}`)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                          title="View detail">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                        {canEdit && (
                          <button onClick={() => openEdit(r)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                            title="Edit receiver">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/40">
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); fetchReceivers(search, selectedSender, p); }}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors">
                Prev
              </button>
              <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); fetchReceivers(search, selectedSender, p); }}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Add New Receiver</h2>
                <p className="text-xs text-gray-400 mt-0.5">Create a recipient profile for Ghana payouts</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              <ReceiverForm
                data={createData}
                onChange={(patch) => setCreateData((d) => ({ ...d, ...patch }))}
                error={createError}
                onSubmit={handleCreate}
                onCancel={() => setShowCreate(false)}
                submitLabel="Create Receiver"
                isSubmitting={createSubmitting}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editReceiver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Edit Receiver</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editReceiver.firstName} {editReceiver.lastName}</p>
              </div>
              <button onClick={() => setEditReceiver(null)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              <ReceiverForm
                data={editData}
                onChange={(patch) => setEditData((d) => ({ ...d, ...patch }))}
                error={editError}
                onSubmit={handleEdit}
                onCancel={() => setEditReceiver(null)}
                submitLabel="Save Changes"
                isSubmitting={editSubmitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
