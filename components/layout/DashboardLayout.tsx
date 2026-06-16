'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar, {
  sendingNav,
  receivingNav,
  getAdminNav,
  portalAccent,
  ALL_PORTALS,
} from './Sidebar';
import ReceivingNotificationBadge from '@/components/ui/ReceivingNotificationBadge';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import AndyDLogo from '@/components/ui/AndyDLogo';
import { allowedPortals, homePortal } from '@/lib/auth/roles';
import { useServerDate } from '@/lib/hooks/useServerDate';
import { apiClient } from '@/lib/api-client';

interface DashboardLayoutProps {
  children: ReactNode;
  portal: 'sending' | 'receiving' | 'admin';
}

const portalLabels = {
  sending:   'Sending Portal',
  receiving: 'Receiving Portal',
  admin:     'Admin Portal',
};

// Bottom tab definitions per portal
const bottomTabs = {
  sending: [
    {
      name: 'Home', href: '/sending', exact: true,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'New Txn', href: '/sending/transactions/new', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      name: 'Txns', href: '/sending/transactions', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      name: 'Senders', href: '/sending/senders', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: 'More', href: '__more__', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
        </svg>
      ),
    },
  ],
  receiving: [
    {
      name: 'Home', href: '/receiving', exact: true,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Pending', href: '/receiving/pending', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: 'Till', href: '/receiving/till', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      name: 'Disburse', href: '/receiving/disbursements', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      name: 'More', href: '__more__', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
        </svg>
      ),
    },
  ],
  admin: [
    {
      name: 'Home', href: '/admin', exact: true,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Users', href: '/admin/users', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: 'Sync', href: '/admin/sync', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      name: 'Reports', href: '/admin/reports', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      name: 'More', href: '__more__', exact: false,
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
        </svg>
      ),
    },
  ],
};

// ─── Server date bar ──────────────────────────────────────────────────────────
function ServerDateBar({ portal }: { portal: 'sending' | 'receiving' | 'admin' }) {
  const { user } = useAuth();
  const { sendingDate, receivingDate, loading } = useServerDate(portal);

  const canAdjustSending   = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'].includes(user?.role ?? '');
  const canAdjustReceiving = ['SUPER_ADMIN', 'ADMIN', 'RECEIVING_ADMIN'].includes(user?.role ?? '');

  const [open, setOpen]     = useState(false);
  const [target, setTarget] = useState<'sending' | 'receiving'>('sending');
  const [input, setInput]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [localSending, setLocalSending]     = useState<string | null>(null);
  const [localReceiving, setLocalReceiving] = useState<string | null>(null);

  const displaySending   = localSending   ?? sendingDate;
  const displayReceiving = localReceiving ?? receivingDate;

  function openModal(t: 'sending' | 'receiving') {
    setTarget(t);
    setInput(t === 'sending' ? displaySending : displayReceiving);
    setError('');
    setOpen(true);
  }

  async function handleSave() {
    if (!input) return;
    setSaving(true);
    setError('');
    if (target === 'sending') {
      const res = await apiClient.setSendingServerDate(input);
      if (res.success && res.data) {
        setLocalSending((res.data as { serverDate: string }).serverDate);
        setOpen(false);
      } else {
        setError(res.error || 'Failed to update');
      }
    } else {
      const branchId = user?.receivingPoint?.id;
      const res = await apiClient.setReceivingServerDate({ date: input, receivingPointId: branchId });
      if (res.success && res.data) {
        setLocalReceiving((res.data as { serverDate: string }).serverDate);
        setOpen(false);
      } else {
        setError(res.error || 'Failed to update');
      }
    }
    setSaving(false);
  }

  function fmt(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  const pencilIcon = (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );

  function DateChip({ label, date, can, t }: { label?: string; date: string; can: boolean; t: 'sending' | 'receiving' }) {
    return (
      <span className="flex items-center gap-1">
        {label && <span className="text-gray-400 text-xs">{label}</span>}
        <span className="text-gray-700 text-xs font-medium">{fmt(date)}</span>
        {can && (
          <button onClick={() => openModal(t)} className="text-gray-400 hover:text-gray-600 transition-colors" title="Adjust date">
            {pencilIcon}
          </button>
        )}
      </span>
    );
  }

  if (loading) {
    return <span className="w-32 h-3 bg-gray-200 rounded animate-pulse inline-block" />;
  }

  const accentBtn  = target === 'sending' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700';
  const accentRing = target === 'sending' ? 'focus:ring-blue-500' : 'focus:ring-emerald-500';

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {portal === 'admin' ? (
          <>
            <DateChip label="Sending:" date={displaySending} can={canAdjustSending} t="sending" />
            <span className="text-gray-300">·</span>
            <DateChip label="Receiving:" date={displayReceiving} can={canAdjustReceiving} t="receiving" />
          </>
        ) : portal === 'sending' ? (
          <DateChip date={displaySending} can={canAdjustSending} t="sending" />
        ) : (
          <DateChip date={displayReceiving} can={canAdjustReceiving} t="receiving" />
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-gray-200 rounded-lg shadow-lg w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Adjust {target === 'sending' ? 'Sending' : 'Receiving'} Date</h2>
                <p className="text-xs text-gray-500 mt-0.5">Set the current business date for this portal.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              type="date" value={input} onChange={(e) => setInput(e.target.value)}
              className={`w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 ${accentRing}`}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSave} disabled={saving || !input}
                className={`flex-1 py-2 text-sm font-semibold text-white rounded transition-colors disabled:opacity-50 ${accentBtn}`}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setOpen(false)} className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── More bottom sheet ────────────────────────────────────────────────────────
function MoreBottomSheet({ portal, isOpen, onClose }: { portal: 'sending' | 'receiving' | 'admin'; isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const acc  = portalAccent[portal];
  const role = user?.role ?? '';

  const navItems =
    portal === 'sending'   ? sendingNav :
    portal === 'receiving' ? receivingNav :
    getAdminNav(role);

  const visibleNavItems = navItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
  const userAllowedPortals = allowedPortals(role);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-xl max-h-[80vh] flex flex-col rounded-t-xl transition-transform duration-250 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Header */}
        <div className={`${acc.headerBg} rounded-t-xl shrink-0 px-4 py-3`}>
          <div className="flex justify-center mb-2">
            <div className="w-8 h-1 bg-white/30 rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-white/20 rounded flex items-center justify-center">
                <AndyDLogo size={15} variant="white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">{portalLabels[portal]}</p>
                <p className="text-white/70 text-xs leading-tight">{user?.firstName} {user?.lastName}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 bg-white/20 rounded flex items-center justify-center text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-2">
            <ServerDateBar portal={portal} />
          </div>
        </div>

        {/* Nav list */}
        <div className="flex-1 overflow-y-auto py-2">
          {visibleNavItems.map((item) => {
            if (item.children) {
              return (
                <div key={item.name}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.name}</p>
                  {item.children.map((child) => {
                    const active = isActive(child.href);
                    return (
                      <Link
                        key={child.href} href={child.href} onClick={onClose}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium border-l-2 mx-2 transition-colors rounded
                          ${active ? `${acc.activeText} ${acc.activeBg} ${acc.activeBorder}` : 'text-gray-600 border-transparent hover:bg-gray-50'}`}
                      >
                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              );
            }
            const active = isActive(item.href);
            return (
              <Link
                key={item.href} href={item.href} onClick={onClose}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium border-l-2 mx-2 transition-colors rounded
                  ${active ? `${acc.activeText} ${acc.activeBg} ${acc.activeBorder}` : 'text-gray-600 border-transparent hover:bg-gray-50'}`}
              >
                <span className={active ? '' : 'opacity-60'}>{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Portal switcher */}
        {userAllowedPortals.length > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Switch Portal</p>
            <div className="flex gap-2">
              {ALL_PORTALS.filter(({ key }) => userAllowedPortals.includes(key)).map(({ key, label, href }) => (
                <Link
                  key={key} href={href} onClick={onClose}
                  className={`flex-1 text-center py-2 rounded text-xs font-semibold transition-colors border
                    ${portal === key ? `${acc.switcher} border-transparent` : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0 safe-area-bottom">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700 truncate">{role.replace(/_/g, ' ')}</p>
              {user?.receivingPoint && (
                <p className="text-xs text-gray-400 truncate">{user.receivingPoint.name}</p>
              )}
            </div>
            <button
              onClick={() => { onClose(); logout(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────
function TopBarUserMenu({ portal }: { portal: 'sending' | 'receiving' | 'admin' }) {
  const { user, logout } = useAuth();
  const [open, setOpen]  = useState(false);
  const acc  = portalAccent[portal];
  const role = user?.role ?? '';
  const userAllowedPortals = allowedPortals(role);
  const initials = user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() : '??';

  return (
    <div className="flex items-center gap-2 shrink-0">
      {portal === 'receiving' && <ReceivingNotificationBadge />}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
        >
          <div className={`w-7 h-7 rounded ${acc.headerBg} flex items-center justify-center shrink-0`}>
            <span className="text-white text-[11px] font-bold leading-none">{initials}</span>
          </div>
          <span className="hidden sm:block text-xs font-medium text-gray-700 max-w-[110px] truncate">
            {user?.firstName} {user?.lastName}
          </span>
          <svg className={`hidden sm:block w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-40 w-52 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  {role.replace(/_/g, ' ')}{user?.receivingPoint ? ` · ${user.receivingPoint.name}` : ''}
                </p>
              </div>

              {userAllowedPortals.length > 1 && (
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Switch Portal</p>
                  <div className="flex gap-1.5">
                    {ALL_PORTALS.filter(({ key }) => userAllowedPortals.includes(key)).map(({ key, label, href }) => {
                      const a = portalAccent[key];
                      return (
                        <Link
                          key={key} href={href} onClick={() => setOpen(false)}
                          className={`flex-1 text-center py-1.5 rounded text-[11px] font-semibold transition-colors border
                            ${portal === key ? `${a.switcher} border-transparent` : 'text-gray-400 border-gray-200 hover:bg-gray-50'}`}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="px-3 py-2">
                <button
                  onClick={() => { setOpen(false); logout(); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function DashboardLayout({ children, portal }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) { router.push('/login'); return; }
    const allowed = allowedPortals(user.role);
    if (!allowed.includes(portal)) router.push(`/${homePortal(user.role)}`);
  }, [isLoading, isAuthenticated, user, portal, router]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <AndyDLogo size={40} variant="color" />
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const allowed = allowedPortals(user.role);
  if (!allowed.includes(portal)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-2">
          <AndyDLogo size={40} variant="color" />
          <p className="text-xs text-gray-400">Redirecting…</p>
        </div>
      </div>
    );
  }

  const tabs = bottomTabs[portal];

  function isTabActive(tab: { href: string; exact: boolean }) {
    if (tab.href === '__more__') return false;
    if (tab.exact) return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }

  const acc = portalAccent[portal];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-100 overflow-hidden">
      <Sidebar portal={portal} />

      <main className="flex-1 overflow-y-auto pb-16 lg:pb-0 flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
            <ServerDateBar portal={portal} />
            <TopBarUserMenu portal={portal} />
          </div>
        </div>

        {/* Page content */}
        <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto w-full">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 safe-area-bottom bg-white border-t border-gray-200">
        <div className="flex items-center h-14 px-1">
          {tabs.map((tab) => {
            const active    = isTabActive(tab);
            const isMore    = tab.href === '__more__';
            const isMoreOn  = isMore && moreOpen;
            const on        = active || isMoreOn;

            if (isMore) {
              return (
                <button key="more" onClick={() => setMoreOpen(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1"
                >
                  {tab.icon(isMoreOn)}
                  <span className={`text-[10px] font-semibold ${on ? acc.activeText : 'text-gray-400'}`}>More</span>
                </button>
              );
            }

            return (
              <Link key={tab.href} href={tab.href} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1">
                <div className="relative">
                  {tab.icon(active)}
                  {!active && tab.href === '/receiving/pending' && portal === 'receiving' && (
                    <span className="absolute -top-1 -right-1">
                      <ReceivingNotificationBadge compact />
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-semibold ${on ? acc.activeText : 'text-gray-400'}`}>{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <MoreBottomSheet portal={portal} isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
