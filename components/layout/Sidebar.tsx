'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AndyDLogo from '@/components/ui/AndyDLogo';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
  children?: NavItem[];
}

interface SidebarProps {
  portal: 'sending' | 'receiving' | 'admin';
}

function routeMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => item.children ?? [item]);
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const icons = {
  dashboard: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  transaction: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  money: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  chart: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  document: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  sync: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  building: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
    </svg>
  ),
  logout: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  shield: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  ledger: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M3 14h18M10 3v18M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  ),
  chevron: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  ),
};

// ─── Nav definitions ──────────────────────────────────────────────────────────
export const sendingNav: NavItem[] = [
  { name: 'Dashboard',       href: '/sending',                  icon: icons.dashboard   },
  { name: 'Senders',         href: '/sending/senders',          icon: icons.users       },
  { name: 'Receivers',       href: '/sending/receivers',        icon: icons.users       },
  { name: 'Transactions',    href: '/sending/transactions',     icon: icons.transaction },
  { name: 'New Transaction', href: '/sending/transactions/new', icon: icons.plus        },
  {
    name: 'Reports', href: '/sending/reports', icon: icons.chart,
    children: [
      { name: 'Daily Reports',      href: '/sending/reports',                   icon: icons.chart    },
      { name: 'Closing Balances',   href: '/sending/reports/closing-balances',  icon: icons.document },
      { name: 'Sender Balances',    href: '/sending/reports/sender-balances',   icon: icons.money    },
      { name: 'Sender Statements',  href: '/sending/reports/sender-statements', icon: icons.document },
    ],
  },
  { name: 'End of Day', href: '/sending/eod', icon: icons.document },
  {
    name: 'Accounting', href: '/sending/accounting', icon: icons.ledger,
    roles: ['SUPER_ADMIN', 'ADMIN', 'SENDING_ADMIN'],
    children: [
      { name: 'Sender Ledger',    href: '/sending/accounting/sender-ledger',    icon: icons.ledger  },
      { name: 'Income Summary',   href: '/sending/accounting/income-summary',   icon: icons.chart   },
      { name: 'Cash Management',  href: '/sending/accounting/cash-management',  icon: icons.money   },
    ],
  },
];

export const receivingNav: NavItem[] = [
  { name: 'Dashboard',             href: '/receiving',                        icon: icons.dashboard   },
  { name: 'Pending Payments',      href: '/receiving/pending',                icon: icons.document    },
  { name: 'Disbursements',         href: '/receiving/disbursements',          icon: icons.money       },
  { name: 'Sub-payment Report',    href: '/receiving/sub-payment-report',     icon: icons.chart       },
  { name: 'Additional Till',       href: '/receiving/additional-till-report', icon: icons.ledger      },
  { name: 'My Till',               href: '/receiving/till',                   icon: icons.money       },
  { name: 'Reconciliation',        href: '/receiving/reconciliation',         icon: icons.chart       },
  {
    name: 'Branch Admin', href: '/receiving/admin', icon: icons.settings,
    roles: ['RECEIVING_ADMIN', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'],
    children: [
      { name: 'Transfer Approvals', href: '/receiving/admin/transfers',        icon: icons.money    },
      { name: 'Reconciliations',    href: '/receiving/admin/reconciliations',  icon: icons.chart    },
      { name: 'Transactions',       href: '/receiving/admin/transactions',     icon: icons.document },
      { name: 'Daily Report',       href: '/receiving/admin/reports/daily',    icon: icons.chart    },
      { name: 'End of Day',         href: '/receiving/eod',                    icon: icons.document },
    ],
  },
  {
    name: 'Accounting', href: '/receiving/accounting', icon: icons.ledger,
    roles: ['RECEIVING_ADMIN', 'MANAGER', 'SUPER_ADMIN', 'ADMIN', 'TELLER'],
    children: [
      { name: 'Till Ledger',    href: '/receiving/accounting/till-ledger',    icon: icons.ledger },
      { name: 'Branch Summary', href: '/receiving/accounting/branch-summary', icon: icons.chart  },
    ],
  },
];

const adminNavSending: NavItem[] = [
  { name: 'Dashboard',      href: '/admin',                icon: icons.dashboard },
  { name: 'Users',          href: '/admin/users',          icon: icons.users     },
  { name: 'Permissions',    href: '/admin/permissions',    icon: icons.shield    },
  { name: 'Exchange Rates', href: '/admin/exchange-rates', icon: icons.money     },
  { name: 'Server Dates',   href: '/admin/server-dates',   icon: icons.settings  },
  { name: 'Sync',           href: '/admin/sync',           icon: icons.sync      },
  { name: 'Reports',        href: '/admin/reports',        icon: icons.chart     },
  { name: 'Ledger',         href: '/admin/ledger',         icon: icons.document  },
  {
    name: 'Accounting', href: '/admin/accounting', icon: icons.ledger,
    children: [
      { name: 'Chart of Accounts', href: '/admin/accounting/chart-of-accounts',  icon: icons.ledger   },
      { name: 'Journal Entries',   href: '/admin/accounting/journal',             icon: icons.document },
      { name: 'General Ledger',    href: '/admin/accounting/general-ledger',      icon: icons.ledger   },
      { name: 'Trial Balance',     href: '/admin/accounting/trial-balance',       icon: icons.chart    },
      { name: 'Income Statement',  href: '/admin/accounting/income-statement',    icon: icons.chart    },
      { name: 'Balance Sheet',     href: '/admin/accounting/balance-sheet',       icon: icons.document },
      { name: 'Periods',           href: '/admin/accounting/period',              icon: icons.settings },
      { name: 'Consolidated',      href: '/admin/accounting/consolidated-report', icon: icons.chart    },
    ],
  },
];

const adminNavReceiving: NavItem[] = [
  { name: 'Dashboard',        href: '/admin',                  icon: icons.dashboard },
  { name: 'Users',            href: '/admin/users',            icon: icons.users     },
  { name: 'Permissions',      href: '/admin/permissions',      icon: icons.shield    },
  { name: 'Receiving Points', href: '/admin/receiving-points', icon: icons.building  },
  { name: 'Server Dates',     href: '/admin/server-dates',     icon: icons.settings  },
  { name: 'Ledger',           href: '/admin/ledger',           icon: icons.document  },
  {
    name: 'Accounting', href: '/admin/accounting', icon: icons.ledger,
    children: [
      { name: 'Chart of Accounts', href: '/admin/accounting/chart-of-accounts',  icon: icons.ledger   },
      { name: 'Journal Entries',   href: '/admin/accounting/journal',             icon: icons.document },
      { name: 'General Ledger',    href: '/admin/accounting/general-ledger',      icon: icons.ledger   },
      { name: 'Trial Balance',     href: '/admin/accounting/trial-balance',       icon: icons.chart    },
      { name: 'Income Statement',  href: '/admin/accounting/income-statement',    icon: icons.chart    },
      { name: 'Balance Sheet',     href: '/admin/accounting/balance-sheet',       icon: icons.document },
      { name: 'Periods',           href: '/admin/accounting/period',              icon: icons.settings },
      { name: 'Branch Summary',    href: '/admin/accounting/branch-summary',      icon: icons.building },
    ],
  },
];

const adminNavFull: NavItem[] = [
  { name: 'Dashboard',        href: '/admin',                  icon: icons.dashboard },
  { name: 'Users',            href: '/admin/users',            icon: icons.users     },
  { name: 'Permissions',      href: '/admin/permissions',      icon: icons.shield    },
  { name: 'Receiving Points', href: '/admin/receiving-points', icon: icons.building  },
  { name: 'Exchange Rates',   href: '/admin/exchange-rates',   icon: icons.money     },
  { name: 'Server Dates',     href: '/admin/server-dates',     icon: icons.settings  },
  { name: 'Sync',             href: '/admin/sync',             icon: icons.sync      },
  { name: 'Reports',          href: '/admin/reports',          icon: icons.chart     },
  { name: 'Ledger',           href: '/admin/ledger',           icon: icons.document  },
  { name: 'Audit Log',        href: '/admin/audit-log',        icon: icons.document, roles: ['SUPER_ADMIN', 'ADMIN'] },
  {
    name: 'Accounting', href: '/admin/accounting', icon: icons.ledger,
    children: [
      { name: 'Chart of Accounts', href: '/admin/accounting/chart-of-accounts',  icon: icons.ledger   },
      { name: 'Journal Entries',   href: '/admin/accounting/journal',             icon: icons.document },
      { name: 'General Ledger',    href: '/admin/accounting/general-ledger',      icon: icons.ledger   },
      { name: 'Trial Balance',     href: '/admin/accounting/trial-balance',       icon: icons.chart    },
      { name: 'Income Statement',  href: '/admin/accounting/income-statement',    icon: icons.chart    },
      { name: 'Balance Sheet',     href: '/admin/accounting/balance-sheet',       icon: icons.document },
      { name: 'Periods',           href: '/admin/accounting/period',              icon: icons.settings },
      { name: 'Consolidated',      href: '/admin/accounting/consolidated-report', icon: icons.chart    },
      { name: 'Branch Summary',    href: '/admin/accounting/branch-summary',      icon: icons.building },
    ],
  },
];

export function getAdminNav(role: string): NavItem[] {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return adminNavFull;
  if (role === 'SENDING_ADMIN') return adminNavSending;
  return adminNavReceiving;
}

// ─── Per-portal accent ────────────────────────────────────────────────────────
export const portalAccent = {
  sending: {
    label:       'Sending',
    activeText:  'text-blue-700',
    activeBg:    'bg-blue-50',
    activeBorder:'border-blue-600',
    pill:        'bg-blue-100 text-blue-700',
    switcher:    'bg-blue-600 text-white',
    switchHover: 'hover:bg-blue-50 hover:text-blue-700',
    dot:         'bg-blue-600',
    headerBg:    'bg-blue-700',
  },
  receiving: {
    label:       'Receiving',
    activeText:  'text-emerald-700',
    activeBg:    'bg-emerald-50',
    activeBorder:'border-emerald-600',
    pill:        'bg-emerald-100 text-emerald-700',
    switcher:    'bg-emerald-600 text-white',
    switchHover: 'hover:bg-emerald-50 hover:text-emerald-700',
    dot:         'bg-emerald-600',
    headerBg:    'bg-emerald-700',
  },
  admin: {
    label:       'Admin',
    activeText:  'text-violet-700',
    activeBg:    'bg-violet-50',
    activeBorder:'border-violet-600',
    pill:        'bg-violet-100 text-violet-700',
    switcher:    'bg-violet-600 text-white',
    switchHover: 'hover:bg-violet-50 hover:text-violet-700',
    dot:         'bg-violet-600',
    headerBg:    'bg-violet-700',
  },
};

export const ALL_PORTALS = [
  { key: 'sending'   as const, label: 'Sending',   href: '/sending'   },
  { key: 'receiving' as const, label: 'Receiving',  href: '/receiving' },
  { key: 'admin'     as const, label: 'Admin',      href: '/admin'     },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Sidebar({ portal }: SidebarProps) {
  const pathname  = usePathname();
  const { user }  = useAuth();
  const acc       = portalAccent[portal];
  const role      = user?.role ?? '';

  const navItems =
    portal === 'sending'   ? sendingNav :
    portal === 'receiving' ? receivingNav :
    getAdminNav(role);

  const visibleNavItems = navItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
  const activeHref = flattenNavItems(visibleNavItems)
    .filter((item) => routeMatches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const activeParent = visibleNavItems.find((item) =>
    item.children?.some((c) => activeHref === c.href)
  );

  const [expanded, setExpanded] = useState<string | null>(activeParent?.name ?? null);
  useEffect(() => {
    if (activeParent) setExpanded(activeParent.name);
  }, [pathname, activeParent]);

  return (
    <aside className="hidden lg:flex lg:shrink-0">
      <div className="flex flex-col h-full w-[220px] bg-white border-r border-gray-200">

        {/* Brand header */}
        <div className={`${acc.headerBg} px-4 py-3 shrink-0`}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white/20 rounded flex items-center justify-center shrink-0">
              <AndyDLogo size={16} variant="white" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white leading-tight">Petros Remittance</p>
              <p className="text-[11px] text-white/70 leading-tight">{acc.label} Portal</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {visibleNavItems.map((item) => {

            // Group with children
            if (item.children) {
              const isExpanded = expanded === item.name;
              const hasActive  = item.children.some((c) => activeHref === c.href);
              return (
                <div key={item.name}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : item.name)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[15px] font-medium transition-colors
                      ${hasActive ? `${acc.activeText} ${acc.activeBg}` : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                  >
                    <span className="shrink-0 opacity-70">{item.icon}</span>
                    <span className="flex-1 text-left">{item.name}</span>
                    <span className={`transition-transform duration-150 opacity-40 ${isExpanded ? 'rotate-180' : ''}`}>
                      {icons.chevron}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="ml-3 border-l-2 border-gray-100 pl-2 py-0.5">
                      {item.children.map((child) => {
                        const active = activeHref === child.href;
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            className={`flex items-center gap-2 px-2.5 py-1.5 text-[13px] font-medium transition-colors rounded
                              ${active ? `${acc.activeText} font-semibold` : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
                          >
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Leaf item
            const isActive = activeHref === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-[15px] font-medium transition-colors border-l-2
                  ${isActive
                    ? `${acc.activeText} ${acc.activeBg} ${acc.activeBorder}`
                    : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <span className={`shrink-0 ${isActive ? '' : 'opacity-60'}`}>{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
