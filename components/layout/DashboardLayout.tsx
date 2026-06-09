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

const portalGradients = {
  sending:   'from-blue-600 to-blue-700',
  receiving: 'from-emerald-600 to-emerald-700',
  admin:     'from-violet-600 to-violet-700',
};

const portalLabels = {
  sending:   'Sending Portal',
  receiving: 'Receiving Portal',
  admin:     'Admin Portal',
};

// Bottom tab definitions per portal — top 4 most-used destinations
const bottomTabs = {
  sending: [
    {
      name: 'Home',
      href: '/sending',
      exact: true,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'New Txn',
      href: '/sending/transactions/new',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      name: 'Txns',
      href: '/sending/transactions',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      name: 'Senders',
      href: '/sending/senders',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    { name: 'More', href: '__more__', exact: false, icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      ),
    },
  ],
  receiving: [
    {
      name: 'Home',
      href: '/receiving',
      exact: true,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Pending',
      href: '/receiving/pending',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: 'Till',
      href: '/receiving/till',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      name: 'Disburse',
      href: '/receiving/disbursements',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    { name: 'More', href: '__more__', exact: false, icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      ),
    },
  ],
  admin: [
    {
      name: 'Home',
      href: '/admin',
      exact: true,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Users',
      href: '/admin/users',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: 'Sync',
      href: '/admin/sync',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      name: 'Reports',
      href: '/admin/reports',
      exact: false,
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    { name: 'More', href: '__more__', exact: false, icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      ),
    },
  ],
};

const activeColors = {
  sending:   'text-blue-600 bg-blue-50',
  receiving: 'text-emerald-600 bg-emerald-50',
  admin:     'text-violet-600 bg-violet-50',
};

const activeBarColors = {
  sending:   'bg-blue-500',
  receiving: 'bg-emerald-500',
  admin:     'bg-violet-500',
};

// Active tab pill background (strong fill)
const tabActivePill = {
  sending:   'bg-blue-600',
  receiving: 'bg-emerald-600',
  admin:     'bg-violet-600',
};

// Active tab label colour
const tabActiveLabel = {
  sending:   'text-blue-600',
  receiving: 'text-emerald-600',
  admin:     'text-violet-600',
};

// ─── Server date bar ─────────────────────────────────────────────────────────
function ServerDateBar({ portal }: { portal: 'sending' | 'receiving' | 'admin' }) {
  const { user } = useAuth();
  const { sendingDate, receivingDate, loading } = useServerDate(portal);

  const canAdjustSending   = ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'].includes(user?.role ?? '');
  const canAdjustReceiving = ['SUPER_ADMIN', 'ADMIN', 'RECEIVING_ADMIN'].includes(user?.role ?? '');

  // modal state
  const [open, setOpen]       = useState(false);
  const [target, setTarget]   = useState<'sending' | 'receiving'>('sending');
  const [input, setInput]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  // local overrides after save (so bar reflects change without re-fetch)
  const [localSending, setLocalSending]   = useState<string | null>(null);
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

  const calIcon = (
    <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );

  const pencilIcon = (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );

  function DateChip({
    label, date, can, t,
  }: { label?: string; date: string; can: boolean; t: 'sending' | 'receiving' }) {
    return (
      <span className="flex items-center gap-1">
        {label && <span className="text-gray-400">{label}</span>}
        <span className="text-gray-700 font-medium">{fmt(date)}</span>
        {can && (
          <button
            onClick={() => openModal(t)}
            className="ml-0.5 text-gray-400 hover:text-gray-600 transition-colors"
            title="Adjust date"
          >
            {pencilIcon}
          </button>
        )}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        {calIcon}
        <span className="w-28 h-3 bg-gray-200 rounded animate-pulse inline-block" />
      </div>
    );
  }

  const bar = (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      {calIcon}
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
  );

  const accentBtn   = target === 'sending' ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'   : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500';
  const accentRing  = target === 'sending' ? 'focus:ring-blue-500'   : 'focus:ring-emerald-500';
  const targetLabel = target === 'sending' ? 'Sending' : 'Receiving';

  return (
    <>
      {bar}

      {/* Adjust date modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Adjust {targetLabel} Date</h2>
                <p className="text-xs text-gray-400 mt-0.5">Set the current business date for the {targetLabel.toLowerCase()} portal.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <input
              type="date"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={`w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${accentRing} bg-white`}
            />

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !input}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 ${accentBtn}`}
              >
                {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
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
function MoreBottomSheet({
  portal,
  isOpen,
  onClose,
}: {
  portal: 'sending' | 'receiving' | 'admin';
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const acc = portalAccent[portal];
  const role = user?.role ?? '';

  const navItems =
    portal === 'sending'   ? sendingNav :
    portal === 'receiving' ? receivingNav :
    getAdminNav(role);

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  const userAllowedPortals = allowedPortals(role);
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : '??';

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[82vh] flex flex-col transition-transform duration-300 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Portal header band */}
        <div className={`bg-gradient-to-br ${acc.gradient} rounded-t-3xl shrink-0 px-4 pt-3 pb-4`}>
          {/* Pull handle */}
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 bg-white/40 rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <AndyDLogo size={16} variant="white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{portalLabels[portal]}</p>
                <p className="text-white/70 text-xs leading-tight">{user?.firstName} {user?.lastName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Server date */}
          <div className="mt-2.5 px-0.5">
            <ServerDateBar portal={portal} />
          </div>
        </div>

        {/* Nav list — scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {visibleNavItems.map((item) => {
            if (item.children) {
              return (
                <div key={item.name}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {item.name}
                  </p>
                  {item.children.map((child) => {
                    const active = isActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onClose}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          active ? `${activeColors[portal]}` : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className={active ? activeColors[portal].split(' ')[0] : 'text-gray-400'}>
                          {child.icon}
                        </span>
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
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? `${activeColors[portal]}` : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className={active ? activeColors[portal].split(' ')[0] : 'text-gray-400'}>
                  {item.icon}
                </span>
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Portal switcher */}
        {userAllowedPortals.length > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Switch Portal</p>
            <div className="flex gap-2">
              {ALL_PORTALS
                .filter(({ key }) => userAllowedPortals.includes(key))
                .map(({ key, label, href }) => (
                  <Link
                    key={key}
                    href={href}
                    onClick={onClose}
                    className={`flex-1 text-center py-2 rounded-xl text-xs font-semibold transition-colors ${
                      portal === key
                        ? `${activeColors[key]} ring-1 ring-current`
                        : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
            </div>
          </div>
        )}

        {/* Footer: role info + logout */}
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
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shrink-0"
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

// ─── Top bar: user avatar + portal switcher + logout ─────────────────────────
function TopBarUserMenu({ portal }: { portal: 'sending' | 'receiving' | 'admin' }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const acc = portalAccent[portal];

  const role = user?.role ?? '';
  const userAllowedPortals = allowedPortals(role);
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : '??';

  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* Notification badge (receiving only) */}
      {portal === 'receiving' && <ReceivingNotificationBadge />}

      {/* Avatar button */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-gray-100 transition-colors group"
        >
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${acc.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
            <span className="text-white text-[11px] font-bold leading-none">{initials}</span>
          </div>
          <span className="hidden sm:block text-[13px] font-medium text-gray-700 max-w-[120px] truncate leading-tight">
            {user?.firstName} {user?.lastName}
          </span>
          <svg
            className={`hidden sm:block w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 z-40 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[13px] font-semibold text-gray-900 truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  {role.replace(/_/g, ' ')}
                  {user?.receivingPoint ? ` · ${user.receivingPoint.name}` : ''}
                </p>
              </div>

              {/* Portal switcher */}
              {userAllowedPortals.length > 1 && (
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5 px-1">
                    Switch Portal
                  </p>
                  <div className="flex gap-1.5">
                    {ALL_PORTALS
                      .filter(({ key }) => userAllowedPortals.includes(key))
                      .map(({ key, label, href }) => {
                        const a = portalAccent[key];
                        const isActive = portal === key;
                        return (
                          <Link
                            key={key}
                            href={href}
                            onClick={() => setOpen(false)}
                            className={`flex-1 text-center py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-colors
                              ${isActive ? a.switcher : `text-gray-400 hover:text-gray-700 hover:bg-gray-50`}`}
                          >
                            {label}
                          </Link>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Logout */}
              <div className="px-3 py-2">
                <button
                  onClick={() => { setOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
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
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }
    const allowed = allowedPortals(user.role);
    if (!allowed.includes(portal)) {
      router.push(`/${homePortal(user.role)}`);
    }
  }, [isLoading, isAuthenticated, user, portal, router]);

  // Close more sheet on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <AndyDLogo size={48} variant="color" />
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const allowed = allowedPortals(user.role);
  if (!allowed.includes(portal)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <AndyDLogo size={48} variant="color" />
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Redirecting to your portal…</p>
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

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar portal={portal} />

      {/* Main content — pb-16 reserves space for bottom tab bar on mobile */}
      <main className="flex-1 overflow-y-auto pb-16 lg:pb-0 flex flex-col">
        {/* Sticky top bar: server date + user controls */}
        <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200/60">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2">
            <ServerDateBar portal={portal} />
            <TopBarUserMenu portal={portal} />
          </div>
        </div>
        <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto w-full">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 safe-area-bottom">
        <div className="bg-white/95 backdrop-blur-md border-t border-gray-200/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-end h-16 px-1">
            {tabs.map((tab) => {
              const active = isTabActive(tab);
              const isMore = tab.href === '__more__';
              const isMoreActive = isMore && moreOpen;
              const highlighted = active || isMoreActive;

              const pillCls = `w-14 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${highlighted ? tabActivePill[portal] : 'bg-transparent'}`;
              const labelCls = `text-[10px] font-semibold leading-none transition-colors ${highlighted ? tabActiveLabel[portal] : 'text-gray-400'}`;

              if (isMore) {
                return (
                  <button key="more" onClick={() => setMoreOpen(true)}
                    className="flex-1 flex flex-col items-center justify-center gap-1 pb-2 pt-1.5"
                  >
                    <div className={pillCls}>
                      <svg className={`w-5 h-5 ${isMoreActive ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
                      </svg>
                    </div>
                    <span className={labelCls}>More</span>
                  </button>
                );
              }

              return (
                <Link key={tab.href} href={tab.href}
                  className="flex-1 flex flex-col items-center justify-center gap-1 pb-2 pt-1.5"
                >
                  <div className={pillCls}>
                    <div className={`relative ${active ? '[&_svg]:text-white [&_svg]:stroke-white' : ''}`}>
                      {tab.icon(active)}
                      {!active && tab.href === '/receiving/pending' && portal === 'receiving' && (
                        <span className="absolute -top-1 -right-1">
                          <ReceivingNotificationBadge compact />
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={labelCls}>{tab.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* More bottom sheet */}
      <MoreBottomSheet portal={portal} isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
