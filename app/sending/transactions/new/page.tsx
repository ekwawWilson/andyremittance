'use client';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient, Sender, Receiver, ReceivingPoint, ExchangeRate, Transaction, TransactionReceiver } from '@/lib/api-client';
import TransactionReceipt from '@/components/ui/TransactionReceipt';
import { transactionCodeTemplate } from '@/lib/utils/transaction-code';
import { fmtCAD } from '@/lib/utils/format';

// ─── Portal dropdown ──────────────────────────────────────────────────────────
// Renders the dropdown menu in document.body to escape any overflow:hidden parent.
function DropdownPortal({
  anchorRef,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  });

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div style={style}>{children}</div>,
    document.body
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function previewCode(codeType: string): string {
  return transactionCodeTemplate(
    new Date(),
    codeType === 'ADDITIONAL' ? 'ADDITIONAL' : 'STANDARD'
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── types ────────────────────────────────────────────────────────────────────
interface MultiEntry {
  receiver: Receiver | null;
  search: string;
  results: Receiver[];
  ghsAmount: string;
  notes: string;
}
function emptyEntry(): MultiEntry {
  return { receiver: null, search: '', results: [], ghsAmount: '', notes: '' };
}

// ─── sub-components ───────────────────────────────────────────────────────────
function StepHeader({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b ${active ? 'bg-blue-50 border-blue-100' : 'bg-gray-50/60 border-gray-100'}`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
        {done ? '✓' : n}
      </span>
      <span className={`text-sm font-semibold ${active ? 'text-blue-900' : done ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
    </div>
  );
}

function RateBox({
  rate, rateOverride, setRateOverride, canEditRate,
}: {
  rate: ExchangeRate | null;
  rateOverride: string;
  setRateOverride: (v: string) => void;
  canEditRate: boolean;
}) {
  const official = rate ? Number(rate.cadToGhs) : 0;
  const override = parseFloat(rateOverride);
  const overrideValid = !isNaN(override) && override > 0;
  const deviation = official > 0 && overrideValid ? Math.abs(override - official) / official : 0;
  const warn = deviation > 0.2;
  const effective = overrideValid ? override : official;

  return (
    <div className={`flex-1 rounded-xl p-4 border ${warn ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-400 mb-1">Exchange Rate</p>
      {canEditRate ? (
        <div className="flex items-center gap-2">
          <input
            type="number" step="0.0001" min="0.0001" max="100"
            value={rateOverride || (rate ? String(rate.cadToGhs) : '')}
            onChange={(e) => setRateOverride(e.target.value)}
            className={`w-24 text-lg font-bold border rounded-lg px-2 py-0.5 focus:ring-2 focus:ring-blue-500 focus:outline-none ${warn ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-900'}`}
          />
          <span className="text-xs text-gray-400">GHS/CAD</span>
          {rateOverride && <button type="button" onClick={() => setRateOverride('')} className="text-xs text-red-500 hover:underline">reset</button>}
        </div>
      ) : (
        <p className="text-lg font-bold text-gray-900">{rate ? fmt(Number(rate.cadToGhs)) : '—'} <span className="text-xs font-normal text-gray-400">GHS/CAD</span></p>
      )}
      <p className="text-[10px] text-gray-400 mt-0.5">
        Set by {rate?.setByName ?? '—'}
        {canEditRate && ' · override enabled'}
      </p>
      {warn && (
        <p className="text-xs text-amber-700 font-medium mt-1">
          ⚠ {fmt(override)} deviates {(deviation * 100).toFixed(1)}% from official {fmt(official)}
        </p>
      )}
      {rateOverride && overrideValid && !warn && (
        <p className="text-[10px] text-green-600 mt-0.5">Override active · effective: {fmt(effective)}</p>
      )}
    </div>
  );
}

// ─── SenderSearchBox ──────────────────────────────────────────────────────────
function SenderSearchBox({
  selected, onSelect, onClear, canCreate, canEdit,
  onEditSave,
}: {
  selected: Sender | null;
  onSelect: (s: Sender) => void;
  onClear: () => void;
  canCreate: boolean;
  canEdit: boolean;
  onEditSave: (s: Sender) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Sender[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Sender | null>(null);
  const [addNew, setAddNew] = useState(false);
  const [newData, setNewData] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', city: '' });
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await apiClient.getSenders({ search: q });
      if (res.success && res.data) {
        setResults(res.data.senders);
        setOpen(true);
      }
    }, 250);
  }, [q]);

  const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  // ── add new inline ──
  if (addNew) return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-amber-700">New Sender</span>
        <button type="button" onClick={() => setAddNew(false)} className="text-xs text-amber-600 hover:text-amber-800">Cancel</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="First Name *" value={newData.firstName} onChange={(e) => setNewData({ ...newData, firstName: e.target.value })} className={inputCls} />
        <input placeholder="Last Name *" value={newData.lastName} onChange={(e) => setNewData({ ...newData, lastName: e.target.value })} className={inputCls} />
      </div>
      <input type="tel" placeholder="Phone * e.g. +1 416 555 1234" value={newData.phone} onChange={(e) => setNewData({ ...newData, phone: e.target.value })} minLength={7} maxLength={20} className={inputCls} />
      <input placeholder="Email" value={newData.email} onChange={(e) => setNewData({ ...newData, email: e.target.value })} className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Address" value={newData.address} onChange={(e) => setNewData({ ...newData, address: e.target.value })} className={inputCls} />
        <input placeholder="City" value={newData.city} onChange={(e) => setNewData({ ...newData, city: e.target.value })} className={inputCls} />
      </div>
      <button type="button" disabled={saving} onClick={async () => {
        if (!newData.firstName.trim() || !newData.lastName.trim() || !newData.phone.trim()) return;
        setSaving(true);
        const res = await apiClient.createSender({ ...newData });
        if (res.success && res.data) { onSelect(res.data); setAddNew(false); }
        setSaving(false);
      }} className="w-full py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors">
        {saving ? 'Creating…' : 'Create Sender'}
      </button>
    </div>
  );

  // ── editing ──
  if (editing && editDraft) return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-700">Edit Sender</span>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-blue-600 hover:text-blue-800">Cancel</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={editDraft.firstName} onChange={(e) => setEditDraft({ ...editDraft, firstName: e.target.value })} className={inputCls} placeholder="First Name" />
        <input value={editDraft.lastName} onChange={(e) => setEditDraft({ ...editDraft, lastName: e.target.value })} className={inputCls} placeholder="Last Name" />
      </div>
      <input value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} className={inputCls} placeholder="Phone" />
      <input value={editDraft.email ?? ''} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} className={inputCls} placeholder="Email" />
      <button type="button" disabled={saving} onClick={async () => {
        setSaving(true);
        await onEditSave(editDraft);
        setEditing(false);
        setSaving(false);
      }} className="w-full py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );

  // ── selected ──
  if (selected) {
    const balance = Number(selected.senderLedger?.balance ?? 0);
    const creditLimit = Number(selected.creditLimit ?? 0);
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {`${selected.firstName[0]}${selected.lastName[0]}`}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-900 truncate">{selected.firstName} {selected.lastName}</p>
          <p className="text-xs text-blue-600">{selected.phone}</p>
          {creditLimit > 0 && (
            <p className={`text-[10px] mt-0.5 ${balance < 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              Balance: {balance >= 0 ? `$${fmt(balance)} credit` : `$${fmt(Math.abs(balance))} owing`} · Limit: ${fmt(creditLimit)}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {canEdit && <button type="button" onClick={() => { setEditDraft({ ...selected }); setEditing(true); }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>}
          <button type="button" onClick={onClear} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Change</button>
        </div>
      </div>
    );
  }

  // ── search ──
  return (
    <div ref={anchorRef} className="relative">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input id="sender-search" type="text" autoComplete="off" placeholder="Type sender name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
      {open && results.length > 0 && (
        <DropdownPortal anchorRef={anchorRef}>
          <div ref={dropRef} className="bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
            {results.map((s) => (
              <button key={s.id} type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(s); setQ(''); setResults([]); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors">
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-gray-400">{s.phone}</p>
                  </div>
                  {Number(s.senderLedger?.balance ?? 0) < 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">
                      ${fmt(Math.abs(Number(s.senderLedger?.balance)))} debt
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
      {q.trim() && results.length === 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <p className="text-xs text-gray-400">No senders found</p>
          {canCreate && (
            <button type="button" onClick={() => {
              const parts = q.trim().split(/\s+/);
              setNewData({ firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), phone: '', email: '', address: '', city: '' });
              setAddNew(true);
              setOpen(false);
              setQ('');
            }} className="text-xs font-semibold text-amber-600 hover:text-amber-800 underline">+ Add new sender</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ReceiverSearchBox ────────────────────────────────────────────────────────
function ReceiverSearchBox({
  senderId, selected, onSelect, onClear, canCreate,
}: {
  senderId: string;
  selected: Receiver | null;
  onSelect: (r: Receiver) => void;
  onClear: () => void;
  canCreate: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Receiver[]>([]);
  const [open, setOpen] = useState(false);
  const [addNew, setAddNew] = useState(false);
  const [newData, setNewData] = useState({ firstName: '', lastName: '', phone: '', email: '', relationshipToSender: '' });
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Reset state when sender changes, then pre-load their receivers
  useEffect(() => {
    setQ('');
    setResults([]);
    setOpen(false);
    if (!senderId) return;
    apiClient.getReceivers({ senderId }).then((res) => {
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data as { receivers?: Receiver[] }).receivers ?? [];
        setResults(list);
      }
    });
  }, [senderId]);

  // Filter receivers as the user types
  useEffect(() => {
    if (!senderId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await apiClient.getReceivers({ senderId, search: q || undefined });
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data as { receivers?: Receiver[] }).receivers ?? [];
        setResults(list);
        if (list.length > 0) setOpen(true);
      }
    }, 200);
  }, [q]);

  const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  if (addNew) return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700 uppercase">New Receiver</span>
        <button type="button" onClick={() => setAddNew(false)} className="text-xs text-amber-600">Cancel</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="First Name *" value={newData.firstName} onChange={(e) => setNewData({ ...newData, firstName: e.target.value })} className={inputCls} />
        <input placeholder="Last Name *" value={newData.lastName} onChange={(e) => setNewData({ ...newData, lastName: e.target.value })} className={inputCls} />
      </div>
      <input type="tel" placeholder="Phone * e.g. 055 123 4567" value={newData.phone} onChange={(e) => setNewData({ ...newData, phone: e.target.value })} minLength={9} maxLength={15} className={inputCls} />
      <input placeholder="Email" value={newData.email} onChange={(e) => setNewData({ ...newData, email: e.target.value })} className={inputCls} />
      <input placeholder="Relationship (Family, Friend, Business)" value={newData.relationshipToSender} onChange={(e) => setNewData({ ...newData, relationshipToSender: e.target.value })} className={inputCls} />
      <button type="button" disabled={saving} onClick={async () => {
        if (!newData.firstName.trim() || !newData.phone.trim()) return;
        setSaving(true);
        const res = await apiClient.createReceiver({ senderId, ...newData, preferredMethod: 'CASH' });
        if (res.success && res.data) { onSelect(res.data); setAddNew(false); }
        setSaving(false);
      }} className="w-full py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors">
        {saving ? 'Creating…' : 'Create Receiver'}
      </button>
    </div>
  );

  if (selected) return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl">
      <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
        {`${selected.firstName[0]}${selected.lastName[0]}`}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-green-900 truncate">{selected.firstName} {selected.lastName}</p>
        <p className="text-xs text-green-600">{selected.phone}</p>
      </div>
      <button type="button" onClick={onClear} className="text-xs text-green-600 hover:text-green-800 font-medium shrink-0">Change</button>
    </div>
  );

  return (
    <div ref={anchorRef} className="relative">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="text" autoComplete="off" placeholder="Type receiver name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
      {open && results.length > 0 && (
        <DropdownPortal anchorRef={anchorRef}>
          <div ref={dropRef} className="bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
            {results.map((r) => (
              <button key={r.id} type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(r); setQ(''); setResults([]); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-green-50 border-b border-gray-50 last:border-0 transition-colors">
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{r.firstName} {r.lastName}</p>
                    <p className="text-xs text-gray-400">{r.phone}</p>
                  </div>
                  {r.preferredMethod && r.preferredMethod !== 'CASH' && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${r.preferredMethod === 'BANK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {r.preferredMethod === 'BANK' ? 'Bank' : 'MoMo'}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
      {q.trim() && results.length === 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <p className="text-xs text-gray-400">No receivers found</p>
          {canCreate && (
            <button type="button" onClick={() => {
              const parts = q.trim().split(/\s+/);
              setNewData({ firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), phone: '', email: '', relationshipToSender: '' });
              setOpen(false);
              setAddNew(true);
              setQ('');
            }} className="text-xs font-semibold text-amber-600 hover:text-amber-800 underline">+ Add new receiver</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NewTransactionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const canEditRate = user?.permissions?.includes('EDIT_EXCHANGE_RATE') ?? false;
  const canCreateSender = user?.permissions?.includes('CREATE_SENDERS') ?? false;
  const canEditSender = user?.permissions?.includes('EDIT_SENDERS') ?? false;
  const canCreateReceiver = user?.permissions?.includes('CREATE_RECEIVERS') ?? false;

  // Reference data
  const [points, setPoints] = useState<ReceivingPoint[]>([]);
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [staleRate, setStaleRate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [todayTxns, setTodayTxns] = useState<Transaction[]>([]);

  // Sender / receiver
  const [sender, setSender] = useState<Sender | null>(null);
  const [receiver, setReceiver] = useState<Receiver | null>(null);

  // Multi-receiver mode
  const [multiMode, setMultiMode] = useState(false);
  const [multiEntries, setMultiEntries] = useState<MultiEntry[]>([emptyEntry(), emptyEntry()]);
  const [receiversDeferred, setReceiversDeferred] = useState(false);

  // Rate override
  const [rateOverride, setRateOverride] = useState('');

  // Form fields
  const [cadAmount, setCadAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'E_TRANSFER' | 'SPLIT'>('CASH');
  const [amountPaidCAD, setAmountPaidCAD] = useState('');
  const [receivingMode, setReceivingMode] = useState<'CASH' | 'BANK' | 'MOMO'>('CASH');
  const [receivingPointId, setReceivingPointId] = useState('');
  const [codeType, setCodeType] = useState<'STANDARD' | 'ADDITIONAL'>('STANDARD');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [notes, setNotes] = useState('');

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastCreatedTx, setLastCreatedTx] = useState<(Transaction & { transactionReceivers?: TransactionReceiver[] }) | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Derived
  const officialRate = rate ? Number(rate.cadToGhs) : 0;
  const overrideNum = parseFloat(rateOverride);
  const overrideValid = !isNaN(overrideNum) && overrideNum > 0;
  const effectiveRate = overrideValid ? overrideNum : officialRate;
  const cadAmt = parseFloat(cadAmount) || 0;
  const ghsAmt = cadAmt * effectiveRate;
  const paidAmt = parseFloat(amountPaidCAD) || 0;
  const pendingAmt = cadAmt - paidAmt;
  const allocatedGHS = multiEntries.reduce((s, e) => s + (parseFloat(e.ghsAmount) || 0), 0);
  const remainingGHS = ghsAmt - allocatedGHS;
  const overAllocated = allocatedGHS > ghsAmt + 0.01;
  const rateDeviation = officialRate > 0 && overrideValid ? Math.abs(overrideNum - officialRate) / officialRate : 0;
  const codePreview = previewCode(codeType);

  // Sender credit-limit check (client-side indicator).
  // Only the unpaid portion creates new debt — if the sender pays the full amount
  // upfront there is no credit exposure regardless of the limit.
  const senderBalance = Number(sender?.senderLedger?.balance ?? 0);
  const senderCreditLimit = Number(sender?.creditLimit ?? 0);
  const unpaidAmt = Math.max(0, cadAmt - paidAmt);
  const availableCredit = senderCreditLimit + senderBalance;
  const creditWarning = senderCreditLimit > 0 && unpaidAmt > 0 && unpaidAmt > availableCredit;

  // Step completion tracking
  const step1Done = !!(sender && (multiMode || receiver));
  const step2Done = cadAmt > 0 && paidAmt <= cadAmt + 0.001;
  const step3Done = !!(receivingPointId);

  const [sendingServerDate, setSendingServerDate] = useState<string>(todayISO());

  useEffect(() => {
    let serverDateStr = todayISO();
    Promise.all([
      apiClient.getSendingServerDate(),
      apiClient.getReceivingPoints(),
      apiClient.getTodayRate(),
    ]).then(([sdRes, pRes, rRes]) => {
      if (sdRes.success && sdRes.data) {
        serverDateStr = (sdRes.data as { serverDate: string }).serverDate;
        setSendingServerDate(serverDateStr);
      }
      if (pRes.success && pRes.data) setPoints(pRes.data);
      if (rRes.success && rRes.data) {
        setRate(rRes.data);
        if ((rRes.data as ExchangeRate & { isLatest?: boolean }).isLatest) {
          const d = new Date((rRes.data as ExchangeRate).date);
          setStaleRate(`No rate set for today. Using rate from ${d.toLocaleDateString('en-CA')} — contact admin.`);
        }
      } else {
        setStaleRate('No exchange rate available. Contact admin before creating transactions.');
      }
      return apiClient.getTransactions({ createdById: user?.id, startDate: serverDateStr, endDate: serverDateStr, limit: 50 });
    }).then((tRes) => {
      if (tRes?.success && tRes.data) setTodayTxns(tRes.data.transactions);
      setIsLoading(false);
    });
  }, [user?.id]);

  // Auto-fill bank/momo from selected receiver when mode changes
  const handleModeChange = (mode: 'CASH' | 'BANK' | 'MOMO') => {
    setReceivingMode(mode);
    setBankName(''); setBankAccountNo(''); setBankAccountName(''); setBankBranch('');
    setMomoNumber(''); setMomoName('');
    if (!receiver) return;
    if (mode === 'BANK') {
      setBankName(receiver.bankName ?? '');
      setBankAccountNo(receiver.bankAccount ?? '');
      setBankAccountName('');
      setBankBranch(receiver.bankBranch ?? '');
    }
    if (mode === 'MOMO') {
      setMomoNumber(receiver.momoNumber ?? '');
      setMomoName(`${receiver.firstName} ${receiver.lastName}`);
    }
  };

  useEffect(() => {
    if (!receiver) return;
    if (receivingMode === 'BANK') {
      setBankName(receiver.bankName ?? '');
      setBankAccountNo(receiver.bankAccount ?? '');
      setBankAccountName('');
      setBankBranch(receiver.bankBranch ?? '');
    }
    if (receivingMode === 'MOMO') {
      setMomoNumber(receiver.momoNumber ?? '');
      setMomoName(`${receiver.firstName} ${receiver.lastName}`);
    }
  }, [receiver]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = (keepPointId: string) => {
    setSender(null); setReceiver(null);
    setMultiEntries([emptyEntry(), emptyEntry()]); setReceiversDeferred(false);
    setCadAmount(''); setAmountPaidCAD(''); setRateOverride('');
    setPaymentMethod('CASH'); setReceivingMode('CASH');
    setReceivingPointId(keepPointId);
    setCodeType('STANDARD');
    setBankName(''); setBankAccountNo(''); setBankAccountName(''); setBankBranch('');
    setMomoNumber(''); setMomoName(''); setNotes('');
    setMultiMode(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!rate) { setError('Exchange rate not available. Contact admin to set today\'s rate.'); return; }
    if (rateOverride) {
      const ov = parseFloat(rateOverride);
      if (isNaN(ov) || ov <= 0) { setError('Exchange rate override must be a positive number.'); return; }
    }
    if (!cadAmt || cadAmt <= 0) { setError('CAD amount must be greater than 0.'); return; }
    if (paidAmt > cadAmt + 0.001) { setError(`Amount paid (${fmtCAD(paidAmt)}) cannot exceed total (${fmtCAD(cadAmt)}).`); return; }
    if (!sender) { setError('Please select a sender.'); return; }
    if (!receivingPointId) { setError('Please select a receiving branch.'); return; }
    if (receivingMode === 'BANK') {
      if (!bankName.trim()) { setError('Bank name is required.'); return; }
      if (!bankAccountNo.trim()) { setError('Account number is required.'); return; }
      if (!bankAccountName.trim()) { setError('Account name is required.'); return; }
      if (!bankBranch.trim()) { setError('Bank branch is required.'); return; }
    }
    if (receivingMode === 'MOMO' && !momoNumber.trim()) { setError('Mobile money number is required.'); return; }

    if (multiMode) {
      if (!receiversDeferred) {
        if (multiEntries.length < 2) { setError('Multi-receiver requires at least 2 receivers.'); return; }
        for (let i = 0; i < multiEntries.length; i++) {
          if (!multiEntries[i].receiver) { setError(`Receiver ${i + 1} is not selected.`); return; }
          if (!(parseFloat(multiEntries[i].ghsAmount) > 0)) { setError(`GHS amount for receiver ${i + 1} must be positive.`); return; }
        }
        if (overAllocated) { setError(`Allocated GHS (${fmt(allocatedGHS)}) exceeds total GHS (${fmt(ghsAmt)}).`); return; }
        const ids = multiEntries.map((e) => e.receiver?.id).filter(Boolean);
        if (new Set(ids).size !== ids.length) { setError('The same receiver is selected more than once.'); return; }
      }
    } else {
      if (!receiver) { setError('Please select or create a receiver.'); return; }
    }

    setIsSubmitting(true);
    try {
      if (multiMode) {
        const res = await apiClient.createMultiReceiverTransaction({
          senderId: sender.id,
          cadAmount: cadAmt,
          exchangeRateId: rate.id,
          exchangeRateOverride: overrideValid ? overrideNum : undefined,
          paymentMethod,
          amountPaidCAD: paidAmt,
          receivingMode,
          receivingPointId,
          codeType,
          bankName: receivingMode === 'BANK' ? bankName : undefined,
          bankAccountNo: receivingMode === 'BANK' ? bankAccountNo : undefined,
          bankAccountName: receivingMode === 'BANK' ? bankAccountName : undefined,
          bankBranch: receivingMode === 'BANK' ? bankBranch : undefined,
          momoNumber: receivingMode === 'MOMO' ? momoNumber : undefined,
          momoName: receivingMode === 'MOMO' ? (momoName || undefined) : undefined,
          notes: notes || undefined,
          receiversDeferred,
          receivers: receiversDeferred ? undefined : multiEntries.map((e) => ({
            receiverId: e.receiver!.id,
            ghsAmount: parseFloat(e.ghsAmount),
            notes: e.notes || undefined,
          })),
        });
        if (res.success && res.data) {
          setTodayTxns((prev) => [res.data!, ...prev]);
          setSuccess(`Transaction ${res.data.transactionCode} created (${receiversDeferred ? 'deferred receivers' : `${multiEntries.length} receivers`})`);
          setLastCreatedTx(res.data);
          setShowReceipt(true);
          resetForm(receivingPointId);
        } else {
          setError(res.error || 'Failed to create transaction.');
        }
      } else {
        const res = await apiClient.createTransaction({
          senderId: sender.id,
          receiverId: receiver!.id,
          cadAmount: cadAmt,
          exchangeRateId: rate.id,
          exchangeRateOverride: overrideValid ? overrideNum : undefined,
          paymentMethod,
          amountPaidCAD: paidAmt,
          receivingMode,
          receivingPointId,
          transactionDate: new Date(sendingServerDate + 'T12:00:00.000Z').toISOString(),
          codeType,
          bankName: receivingMode === 'BANK' ? bankName : undefined,
          bankAccountNo: receivingMode === 'BANK' ? bankAccountNo : undefined,
          bankAccountName: receivingMode === 'BANK' ? bankAccountName : undefined,
          bankBranch: receivingMode === 'BANK' ? bankBranch : undefined,
          momoNumber: receivingMode === 'MOMO' ? momoNumber : undefined,
          momoName: receivingMode === 'MOMO' ? (momoName || `${receiver!.firstName} ${receiver!.lastName}`) : undefined,
          notes: notes || undefined,
        });
        if (res.success && res.data) {
          setTodayTxns((prev) => [res.data!, ...prev]);
          setSuccess(`Transaction ${res.data.transactionCode} created successfully`);
          setLastCreatedTx(res.data);
          setShowReceipt(true);
          resetForm(receivingPointId);
        } else {
          setError(res.error || 'Failed to create transaction.');
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    </div>
  );

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* ─── Left: wizard form ─── */}
      <div className="w-full lg:w-5/12 space-y-4">
        {/* Page title + code/rate pills */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">New Transaction</h1>
          <p className="text-sm text-gray-400 mt-0.5">Fill each step, then submit</p>
        </div>

        {/* Code + Rate row */}
        <div className="flex gap-3">
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-500 mb-1">Code Format</p>
            <p className="font-mono font-bold text-blue-700 text-lg">{codePreview}</p>
            <p className="text-[10px] text-blue-400 mt-0.5">
              Generated on submit. {codeType === 'ADDITIONAL' ? 'Immediate sync' : 'Synced at EOD'}
            </p>
          </div>
          <RateBox rate={rate} rateOverride={rateOverride} setRateOverride={setRateOverride} canEditRate={canEditRate} />
        </div>

        {/* Stale rate warning */}
        {staleRate && (
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl">
            <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <p className="text-xs text-red-700 font-medium">{staleRate}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center justify-between p-3.5 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm font-medium text-green-800">{success}</p>
            </div>
            <button type="button" onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700 text-lg leading-none">&times;</button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
            <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Credit limit warning */}
        {creditWarning && (
          <div className="flex items-start gap-2.5 p-3.5 bg-orange-50 border border-orange-200 rounded-xl">
            <svg className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <p className="text-xs text-orange-800">
              The unpaid portion ($<strong>{fmt(unpaidAmt)}</strong>) exceeds {sender?.firstName}&apos;s available credit of $<strong>{fmt(Math.max(0, availableCredit))}</strong>. Collect more upfront or this will be rejected.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* ── Step 1: Sender & Receiver ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <StepHeader n={1} label="Sender & Receiver" active={true} done={step1Done} />
            <div className="px-5 py-4 space-y-4">
              {/* Multi-mode toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500">Receiver Mode</label>
                <button type="button"
                  onClick={() => { setMultiMode((v) => !v); setReceiver(null); setMultiEntries([emptyEntry(), emptyEntry()]); }}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border-2 transition-all ${multiMode ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {multiMode ? 'Multi-Receiver' : 'Single Receiver'}
                </button>
              </div>

              {/* Sender */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Sender</label>
                <SenderSearchBox
                  selected={sender}
                  onSelect={(s) => { setSender(s); setReceiver(null); setMultiEntries([emptyEntry(), emptyEntry()]); }}
                  onClear={() => { setSender(null); setReceiver(null); setMultiEntries([emptyEntry(), emptyEntry()]); }}
                  canCreate={canCreateSender}
                  canEdit={canEditSender}
                  onEditSave={async (s) => { await apiClient.updateSender(s.id, { firstName: s.firstName, lastName: s.lastName, phone: s.phone, email: s.email ?? undefined }); setSender(s); }}
                />
              </div>

              {/* Receiver(s) */}
              {sender && (
                multiMode ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-500">Receivers</label>
                      {!receiversDeferred && ghsAmt > 0 && (
                        <span className={`text-xs font-semibold ${overAllocated ? 'text-red-600' : allocatedGHS >= ghsAmt - 0.01 ? 'text-green-600' : 'text-gray-400'}`}>
                          GHS {fmt(allocatedGHS)} / {fmt(ghsAmt)} {overAllocated ? '— over!' : allocatedGHS >= ghsAmt - 0.01 ? '✓ fully allocated' : `(${fmt(remainingGHS)} left)`}
                        </span>
                      )}
                    </div>

                    {/* Deferred checkbox */}
                    <label className="flex items-center gap-2.5 mb-3 cursor-pointer p-3 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors">
                      <input type="checkbox" checked={receiversDeferred} onChange={(e) => setReceiversDeferred(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                      <div>
                        <p className="text-sm font-medium text-purple-900">Assign receivers at branch</p>
                        <p className="text-xs text-purple-600 mt-0.5">Teller will enter names & GHS allocations during disbursement</p>
                      </div>
                    </label>

                    {receiversDeferred ? (
                      <div className="flex items-start gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>GHS {ghsAmt > 0 ? fmt(ghsAmt) : '—'} will be allocated by the teller at disbursement.</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {multiEntries.map((entry, idx) => (
                          <div key={idx} className="border border-purple-100 bg-purple-50/40 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-purple-700">Receiver {idx + 1}</span>
                              {multiEntries.length > 2 && (
                                <button type="button" onClick={() => setMultiEntries((p) => p.filter((_, i) => i !== idx))}
                                  className="text-xs text-red-400 hover:text-red-600 font-medium">Remove</button>
                              )}
                            </div>
                            {entry.receiver ? (
                              <div className="flex items-center justify-between px-2.5 py-2 bg-white border border-purple-200 rounded-lg mb-2">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{entry.receiver.firstName} {entry.receiver.lastName}</p>
                                  <p className="text-xs text-gray-500">{entry.receiver.phone}</p>
                                </div>
                                <button type="button" onClick={() => setMultiEntries((p) => p.map((e, i) => i === idx ? { ...e, receiver: null, search: '', results: [] } : e))}
                                  className="text-xs text-purple-600 hover:text-purple-800 font-medium">Change</button>
                              </div>
                            ) : (
                              <div className="relative mb-2">
                                <input type="text" autoComplete="off" placeholder="Search receiver by name…"
                                  value={entry.search}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setMultiEntries((p) => p.map((en, i) => i === idx ? { ...en, search: val, results: [] } : en));
                                    if (val.trim()) {
                                      apiClient.getReceivers({ senderId: sender.id, search: val }).then((res) => {
                                        if (res.success && res.data)
                                          setMultiEntries((p) => p.map((en, i) => i === idx ? { ...en, results: Array.isArray(res.data) ? res.data : [] } : en));
                                      });
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500" />
                                {entry.results.length > 0 && (
                                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                    {entry.results.map((r) => (
                                      <button key={r.id} type="button"
                                        onClick={() => setMultiEntries((p) => p.map((en, i) => i === idx ? { ...en, receiver: r, search: '', results: [] } : en))}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b border-gray-50 last:border-0">
                                        <p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p>
                                        <p className="text-xs text-gray-400">{r.phone}</p>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-medium text-gray-400 mb-1 block">GHS Amount *</label>
                                <input type="number" step="0.01" min="0" placeholder="0.00"
                                  value={entry.ghsAmount}
                                  onChange={(e) => setMultiEntries((p) => p.map((en, i) => i === idx ? { ...en, ghsAmount: e.target.value } : en))}
                                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 font-mono" />
                              </div>
                              <div>
                                <label className="text-[10px] font-medium text-gray-400 mb-1 block">Notes</label>
                                <input type="text" placeholder="Optional"
                                  value={entry.notes}
                                  onChange={(e) => setMultiEntries((p) => p.map((en, i) => i === idx ? { ...en, notes: e.target.value } : en))}
                                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500" />
                              </div>
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={() => setMultiEntries((p) => [...p, emptyEntry()])}
                          className="w-full py-2 border-2 border-dashed border-purple-200 rounded-xl text-xs font-medium text-purple-600 hover:bg-purple-50 transition-colors">
                          + Add Another Receiver
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      Receiver <span className="text-gray-300">— linked to {sender.firstName}</span>
                    </label>
                    <ReceiverSearchBox
                      senderId={sender.id}
                      selected={receiver}
                      onSelect={setReceiver}
                      onClear={() => setReceiver(null)}
                      canCreate={canCreateReceiver}
                    />
                  </div>
                )
              )}
            </div>
          </div>

          {/* ── Step 2: Amount & Payment ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <StepHeader n={2} label="Amount & Payment" active={step1Done} done={step2Done} />
            <div className="px-5 py-4 space-y-3">
              {/* CAD + GHS live preview */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">CAD Amount <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                    <input type="number" step="0.01" min="0.01" value={cadAmount}
                      onChange={(e) => setCadAmount(e.target.value)} placeholder="0.00" required
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">GHS Equivalent</label>
                  <div className={`px-3 py-2.5 rounded-xl text-sm font-mono font-bold border ${ghsAmt > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                    GHS {ghsAmt > 0 ? fmt(ghsAmt) : '0.00'}
                    {multiMode && ghsAmt > 0 && !receiversDeferred && (
                      <span className={`ml-1 text-[10px] font-semibold ${overAllocated ? 'text-red-500' : remainingGHS < 0.01 ? 'text-green-600' : 'text-gray-400'}`}>
                        ({overAllocated ? 'over!' : remainingGHS < 0.01 ? '✓' : `${fmt(remainingGHS)} left`})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment Method (Canada)</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['CASH', '💵 Cash'], ['E_TRANSFER', '📤 E-Transfer'], ['SPLIT', '✂ Split']] as const).map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setPaymentMethod(val)}
                      className={`py-2 text-xs font-semibold rounded-xl border-2 transition-all ${paymentMethod === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount paid + pending */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-gray-500">Amount Paid (CAD)</label>
                    {cadAmt > 0 && paidAmt < cadAmt && (
                      <button
                        type="button"
                        onClick={() => setAmountPaidCAD(cadAmount)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Pay full
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" min="0" max={cadAmount || undefined}
                      value={amountPaidCAD} onChange={(e) => setAmountPaidCAD(e.target.value)} placeholder="0.00"
                      className={`w-full pl-7 pr-3 py-2.5 border rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 ${paidAmt > cadAmt + 0.001 && cadAmt > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                  </div>
                  {paidAmt > cadAmt + 0.001 && cadAmt > 0 && (
                    <p className="text-xs text-red-600 mt-1">Exceeds total CAD amount</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Pending (CAD)</label>
                  <div className={`px-3 py-2.5 rounded-xl border text-sm font-mono font-bold ${pendingAmt > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    ${pendingAmt > 0 ? fmt(pendingAmt) : '0.00'}
                    {pendingAmt <= 0 && cadAmt > 0 && <span className="ml-1 text-[10px] font-normal">Fully paid</span>}
                  </div>
                </div>
              </div>

              {/* Code type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['STANDARD', '📋 Standard', 'Synced at EOD'] as const, ['ADDITIONAL', '⚡ Immediate', 'Auto-synced now'] as const]).map(([val, lbl, sub]) => (
                    <button key={val} type="button" onClick={() => setCodeType(val)}
                      className={`py-2.5 px-3 text-left rounded-xl border-2 transition-all ${codeType === val ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <p className={`text-xs font-semibold ${codeType === val ? 'text-blue-700' : 'text-gray-600'}`}>{lbl}</p>
                      <p className={`text-[10px] mt-0.5 ${codeType === val ? 'text-blue-500' : 'text-gray-400'}`}>{sub}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 3: Delivery Details ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <StepHeader n={3} label="Delivery Details (Ghana)" active={step2Done} done={step3Done} />
            <div className="px-5 py-4 space-y-3">
              {/* Receiving branch */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Receiving Branch <span className="text-red-500">*</span></label>
                <select value={receivingPointId} onChange={(e) => setReceivingPointId(e.target.value)} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">Select branch…</option>
                  {points.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>

              {/* Receiving mode */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Payout Method (Ghana)</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['CASH', '💵 Cash'], ['BANK', '🏦 Bank'], ['MOMO', '📱 MoMo']] as const).map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => handleModeChange(val)}
                      className={`py-2 text-xs font-semibold rounded-xl border-2 transition-all ${receivingMode === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bank */}
              {receivingMode === 'BANK' && (
                <div className="space-y-2.5 pt-1">
                  <p className="text-[10px] font-medium text-gray-400">Bank Details</p>
                  <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank Name *" required className={inputCls} />
                  <input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} placeholder="Account Number *" required minLength={6} maxLength={20} className={`${inputCls} font-mono`} />
                  <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Account Name *" required className={inputCls} />
                  <input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Bank Branch *" required className={inputCls} />
                </div>
              )}

              {/* MoMo */}
              {receivingMode === 'MOMO' && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 mb-1.5">MoMo Details</p>
                    <input type="tel" value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} placeholder="Number *" required minLength={9} maxLength={15} className={inputCls} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 mb-1.5">Name on Number</p>
                    <input value={momoName} onChange={(e) => setMomoName(e.target.value)}
                      placeholder={receiver ? `${receiver.firstName} ${receiver.lastName}` : 'Receiver name'} className={inputCls} />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          </div>

          {/* ── Step 4: Review & Submit ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <StepHeader n={4} label="Review & Submit" active={step3Done} done={false} />
            <div className="px-5 py-4">
              {/* Summary strip */}
              {sender && cadAmt > 0 && (
                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">CAD</p>
                    <p className="text-base font-bold text-gray-900 mt-0.5">${fmt(cadAmt)}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">GHS</p>
                    <p className="text-base font-bold text-green-700 mt-0.5">{fmt(ghsAmt)}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${pendingAmt > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Pending</p>
                    <p className={`text-base font-bold mt-0.5 ${pendingAmt > 0 ? 'text-amber-700' : 'text-green-700'}`}>${fmt(pendingAmt)}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => router.push('/sending/transactions')}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || !!(rateDeviation > 0.2)}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2">
                  {isSubmitting ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      {multiMode
                        ? receiversDeferred
                          ? 'Create Transaction (receivers at branch)'
                          : `Create Multi-Receiver (${multiEntries.length})`
                        : 'Create Transaction'}
                    </>
                  )}
                </button>
              </div>
              {rateDeviation > 0.2 && (
                <p className="text-xs text-amber-700 mt-2 text-center">Reset the rate override (or reduce deviation to &lt;20%) before submitting.</p>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* ─── Right column: today's transactions ─── */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Today&apos;s Transactions</h2>
              <p className="text-xs text-gray-400 mt-0.5">{todayTxns.length} created</p>
            </div>
            <span className="text-[10px] font-medium text-gray-300">{sendingServerDate}</span>
          </div>
          {todayTxns.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">No transactions today yet</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/60 border-b border-gray-100">
                    {['Code', 'Sender → Receiver', 'CAD', 'GHS', 'Status'].map((h) => (
                      <th key={h} className="text-left py-2.5 px-4 text-xs font-medium text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {todayTxns.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-4">
                        <p className="font-mono text-xs font-bold text-blue-600">{t.transactionCode}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{t.codeType === 'ADDITIONAL' ? '⚡ Imm.' : '📋 Std.'}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="text-xs font-medium text-gray-800 truncate max-w-28">{t.sender?.firstName} {t.sender?.lastName}</p>
                        <p className="text-[10px] text-gray-400 truncate max-w-28">
                          {t.transactionReceivers && t.transactionReceivers.length > 0
                            ? `→ ${t.transactionReceivers.length} receivers`
                            : `→ ${t.receiver?.firstName ?? 'Deferred'}`}
                        </p>
                      </td>
                      <td className="py-2.5 px-4 text-xs font-semibold text-gray-800">${fmt(Number(t.cadAmount))}</td>
                      <td className="py-2.5 px-4 text-xs text-gray-500">{fmt(Number(t.ghsAmount))}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          t.status === 'PENDING' ? 'bg-gray-100 text-gray-600' :
                          t.status === 'SYNCED' ? 'bg-blue-100 text-blue-700' :
                          t.status === 'PAID' ? 'bg-green-100 text-green-700' :
                          t.status === 'PARTIAL' || t.status === 'PARTIAL_PAYMENT' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Receipt */}
      {showReceipt && lastCreatedTx && (
        <TransactionReceipt transaction={lastCreatedTx} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
}
