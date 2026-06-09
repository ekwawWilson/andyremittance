// ─── Canonical permission keys ──────────────────────────────────────────────
// This is the single source of truth for every permission key in the system.
// Pure data module — no server-side imports. Safe to import from 'use client' components.

export const ALL_PERMISSION_KEYS = [
  // User & System Management
  'MANAGE_USERS',
  'GRANT_PERMISSIONS',
  'MANAGE_EXCHANGE_RATES',
  'EDIT_EXCHANGE_RATE',
  'MANAGE_RECEIVING_POINTS',
  'MANAGE_LEDGER_ACCOUNTS',
  'MANAGE_VAULT_TRANSFERS',
  'MANAGE_TELLER_TILL',
  // Transactions
  'CREATE_TRANSACTIONS',
  'VIEW_ALL_TRANSACTIONS',
  'EDIT_TRANSACTIONS',
  'DELETE_TRANSACTIONS',
  'FLAG_TRANSACTION',
  'SYNC_TRANSACTIONS',
  'REPRINT_RECEIPT',
  // Senders & Receivers
  'CREATE_SENDERS',
  'VIEW_SENDERS',
  'EDIT_SENDERS',
  'CREATE_RECEIVERS',
  'VIEW_RECEIVERS',
  'EDIT_RECEIVERS',
  // Payments & Reconciliation
  'MARK_PAID',
  'CREATE_RECONCILIATION',
  'APPROVE_RECONCILIATION',
  'VIEW_RECONCILIATIONS',
  'APPROVE_CASH_TRANSFER',
  'RECEIVING_EOD',
  'MANAGE_CASH',
  // Reports
  'VIEW_REPORTS',
  'VIEW_AGENT_REPORTS',
  'VIEW_PAYMENT_REPORTS',
  'VIEW_LEDGER_STATEMENT',
] as const;

// ─── Permission Categories (for UI grouping) ─────────────────────────────────
export const PERMISSION_CATEGORIES = {
  'User & System': [
    'MANAGE_USERS',
    'GRANT_PERMISSIONS',
    'MANAGE_EXCHANGE_RATES',
    'EDIT_EXCHANGE_RATE',
    'MANAGE_RECEIVING_POINTS',
    'MANAGE_LEDGER_ACCOUNTS',
    'MANAGE_VAULT_TRANSFERS',
    'MANAGE_TELLER_TILL',
  ],
  'Transactions': [
    'CREATE_TRANSACTIONS',
    'VIEW_ALL_TRANSACTIONS',
    'EDIT_TRANSACTIONS',
    'DELETE_TRANSACTIONS',
    'FLAG_TRANSACTION',
    'SYNC_TRANSACTIONS',
    'REPRINT_RECEIPT',
  ],
  'Senders & Receivers': [
    'CREATE_SENDERS',
    'VIEW_SENDERS',
    'EDIT_SENDERS',
    'CREATE_RECEIVERS',
    'VIEW_RECEIVERS',
    'EDIT_RECEIVERS',
  ],
  'Payments & Reconciliation': [
    'MARK_PAID',
    'CREATE_RECONCILIATION',
    'APPROVE_RECONCILIATION',
    'VIEW_RECONCILIATIONS',
    'APPROVE_CASH_TRANSFER',
    'RECEIVING_EOD',
    'MANAGE_CASH',
  ],
  'Reports': [
    'VIEW_REPORTS',
    'VIEW_AGENT_REPORTS',
    'VIEW_PAYMENT_REPORTS',
    'VIEW_LEDGER_STATEMENT',
  ],
} as const;

// ─── Permission Labels & Descriptions (for UI) ───────────────────────────────
export const PERMISSION_INFO: Record<string, { label: string; description: string }> = {
  MANAGE_USERS: { label: 'Manage Users', description: 'Create, edit, and deactivate user accounts' },
  GRANT_PERMISSIONS: { label: 'Grant Permissions', description: 'Grant or revoke permissions for other users' },
  MANAGE_EXCHANGE_RATES: { label: 'Manage Exchange Rates', description: 'Set daily exchange rates' },
  EDIT_EXCHANGE_RATE: { label: 'Override Exchange Rate', description: 'Override exchange rate per transaction' },
  MANAGE_RECEIVING_POINTS: { label: 'Manage Branches', description: 'Create and edit receiving branches' },
  MANAGE_LEDGER_ACCOUNTS: { label: 'Manage Ledger', description: 'Create and manage ledger accounts' },
  MANAGE_VAULT_TRANSFERS: { label: 'Vault Transfers', description: 'Transfer funds to/from vault' },
  MANAGE_TELLER_TILL: { label: 'Teller Till', description: 'Manage teller cash drawer' },
  CREATE_TRANSACTIONS: { label: 'Create Transactions', description: 'Create new remittance transactions' },
  VIEW_ALL_TRANSACTIONS: { label: 'View All Transactions', description: 'View transactions from all agents' },
  EDIT_TRANSACTIONS: { label: 'Edit Transactions', description: 'Modify existing transactions' },
  DELETE_TRANSACTIONS: { label: 'Delete Transactions', description: 'Cancel/delete transactions' },
  FLAG_TRANSACTION: { label: 'Flag Transactions', description: 'Hold or restore receiving-side transactions with issues' },
  SYNC_TRANSACTIONS: { label: 'Sync Transactions', description: 'Trigger end-of-day sync to receiving' },
  REPRINT_RECEIPT: { label: 'Reprint Receipt', description: 'Print receipts for existing transactions' },
  CREATE_SENDERS: { label: 'Create Senders', description: 'Add new sender profiles' },
  VIEW_SENDERS: { label: 'View Senders', description: 'View sender information' },
  EDIT_SENDERS: { label: 'Edit Senders', description: 'Modify sender profiles' },
  CREATE_RECEIVERS: { label: 'Create Receivers', description: 'Add new receiver profiles' },
  VIEW_RECEIVERS: { label: 'View Receivers', description: 'View receiver information' },
  EDIT_RECEIVERS: { label: 'Edit Receivers', description: 'Modify receiver profiles' },
  MARK_PAID: { label: 'Mark as Paid', description: 'Mark transactions as paid/disbursed' },
  CREATE_RECONCILIATION: { label: 'Create Reconciliation', description: 'Submit daily reconciliation' },
  APPROVE_RECONCILIATION: { label: 'Approve Reconciliation', description: 'Approve teller reconciliations' },
  VIEW_RECONCILIATIONS: { label: 'View Reconciliations', description: 'View reconciliation records' },
  APPROVE_CASH_TRANSFER: { label: 'Approve Cash Transfer', description: 'Approve vault-to-till transfer requests' },
  RECEIVING_EOD: { label: 'Receiving End of Day', description: 'Close branch end-of-day on receiving portal' },
  MANAGE_CASH: { label: 'Manage Cash', description: 'Record cash deposits, bank transfers, and operating expenses on the sending side' },
  VIEW_REPORTS: { label: 'View Reports', description: 'Access daily reports' },
  VIEW_AGENT_REPORTS: { label: 'Agent Reports', description: 'View per-agent performance reports' },
  VIEW_PAYMENT_REPORTS: { label: 'Payment Reports', description: 'View payment method reports' },
  VIEW_LEDGER_STATEMENT: { label: 'Ledger Statements', description: 'View ledger account statements' },
};

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

// ─── Role → default permissions ─────────────────────────────────────────────
// SUPER_ADMIN is intentionally empty; runtime checks short-circuit for that role
// and return the full key set where needed (e.g. /api/auth/me).

export const ROLE_DEFAULTS: Record<string, readonly string[]> = {
  SUPER_ADMIN: [],
  RECEIVING_ADMIN: [
    'MARK_PAID',
    'MANAGE_TELLER_TILL',
    'APPROVE_RECONCILIATION',
    'VIEW_RECONCILIATIONS',
    'APPROVE_CASH_TRANSFER',
    'RECEIVING_EOD',
    'MANAGE_VAULT_TRANSFERS',
    'MANAGE_USERS',
    'VIEW_LEDGER_STATEMENT',
    'VIEW_ALL_TRANSACTIONS',
    'VIEW_REPORTS',
    'FLAG_TRANSACTION',
    'GRANT_PERMISSIONS',
    'VIEW_SENDERS',
    'VIEW_RECEIVERS',
    'REPRINT_RECEIPT',
  ],
  SENDING_ADMIN: [
    'MANAGE_USERS',
    'MANAGE_EXCHANGE_RATES',
    'EDIT_EXCHANGE_RATE',
    'MANAGE_RECEIVING_POINTS',
    'MANAGE_LEDGER_ACCOUNTS',
    'GRANT_PERMISSIONS',
    'SYNC_TRANSACTIONS',
    'VIEW_ALL_TRANSACTIONS',
    'VIEW_REPORTS',
    'VIEW_AGENT_REPORTS',
    'VIEW_PAYMENT_REPORTS',
    'VIEW_LEDGER_STATEMENT',
    'EDIT_TRANSACTIONS',
    'DELETE_TRANSACTIONS',
    'CREATE_TRANSACTIONS',
    'CREATE_SENDERS',
    'VIEW_SENDERS',
    'EDIT_SENDERS',
    'CREATE_RECEIVERS',
    'VIEW_RECEIVERS',
    'EDIT_RECEIVERS',
    'VIEW_RECONCILIATIONS',
    'MANAGE_VAULT_TRANSFERS',
    'MARK_PAID',
    'REPRINT_RECEIPT',
    'MANAGE_CASH',
  ],
  ADMIN: [
    'MANAGE_USERS',
    'MANAGE_EXCHANGE_RATES',
    'EDIT_EXCHANGE_RATE',
    'MANAGE_RECEIVING_POINTS',
    'MANAGE_LEDGER_ACCOUNTS',
    'GRANT_PERMISSIONS',
    'SYNC_TRANSACTIONS',
    'VIEW_ALL_TRANSACTIONS',
    'FLAG_TRANSACTION',
    'VIEW_REPORTS',
    'VIEW_AGENT_REPORTS',
    'VIEW_PAYMENT_REPORTS',
    'VIEW_LEDGER_STATEMENT',
    'EDIT_TRANSACTIONS',
    'DELETE_TRANSACTIONS',
    'CREATE_TRANSACTIONS',
    'CREATE_SENDERS',
    'VIEW_SENDERS',
    'EDIT_SENDERS',
    'CREATE_RECEIVERS',
    'VIEW_RECEIVERS',
    'EDIT_RECEIVERS',
    'VIEW_RECONCILIATIONS',
    'APPROVE_RECONCILIATION',
    'MANAGE_VAULT_TRANSFERS',
    'MARK_PAID',
    'REPRINT_RECEIPT',
    'MANAGE_CASH',
  ],
  MANAGER: [
    'SYNC_TRANSACTIONS',
    'VIEW_ALL_TRANSACTIONS',
    'VIEW_REPORTS',
    'VIEW_AGENT_REPORTS',
    'VIEW_PAYMENT_REPORTS',
    'VIEW_LEDGER_STATEMENT',
    'MANAGE_VAULT_TRANSFERS',
    'APPROVE_RECONCILIATION',
    'VIEW_RECONCILIATIONS',
    'APPROVE_CASH_TRANSFER',
    'RECEIVING_EOD',
    'CREATE_TRANSACTIONS',
    'CREATE_SENDERS',
    'VIEW_SENDERS',
    'EDIT_SENDERS',
    'CREATE_RECEIVERS',
    'VIEW_RECEIVERS',
    'EDIT_RECEIVERS',
    'EDIT_TRANSACTIONS',
    'DELETE_TRANSACTIONS',
    'MARK_PAID',
    'REPRINT_RECEIPT',
  ],
  TELLER: [
    'MARK_PAID',
    'MANAGE_TELLER_TILL',
    'CREATE_RECONCILIATION',
    'VIEW_RECONCILIATIONS',
    'VIEW_ALL_TRANSACTIONS',
    'VIEW_SENDERS',
    'VIEW_RECEIVERS',
    'REPRINT_RECEIPT',
  ],
  SENDING_AGENT: [
    'CREATE_TRANSACTIONS',
    'CREATE_SENDERS',
    'VIEW_SENDERS',
    'VIEW_RECEIVERS',
    'CREATE_RECEIVERS',
    'VIEW_RECONCILIATIONS',
    'REPRINT_RECEIPT',
  ],
};

// ─── Pure helper ─────────────────────────────────────────────────────────────

export function roleHasPermission(role: string, key: string): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return ROLE_DEFAULTS[role]?.includes(key) ?? false;
}

// ─── Portal access matrix ────────────────────────────────────────────────────
//
// Defines which portals each role may navigate to.
//   SUPER_ADMIN   → all three portals (sending, receiving, admin)
//   ADMIN         → sending + admin (global sending-side admin)
//   SENDING_ADMIN → sending + admin (sending-side admin only)
//   SENDING_AGENT → sending only
//   RECEIVING_ADMIN → receiving + admin (receiving-side admin, own branch)
//   MANAGER       → receiving + admin (branch manager)
//   TELLER        → receiving only
//
// Note: admin portal nav items are further filtered by role in the sidebar
// so SENDING_ADMIN never sees receiving-related admin modules and vice-versa.

export const PORTAL_ACCESS: Record<string, ReadonlyArray<'sending' | 'receiving' | 'admin'>> = {
  SUPER_ADMIN:    ['sending', 'receiving', 'admin'],
  ADMIN:          ['sending', 'admin'],
  SENDING_ADMIN:  ['sending', 'admin'],
  SENDING_AGENT:  ['sending'],
  RECEIVING_ADMIN:['receiving', 'admin'],
  MANAGER:        ['receiving', 'admin'],
  TELLER:         ['receiving'],
};

/** Returns the portals the user is allowed to visit */
export function allowedPortals(role: string): ReadonlyArray<'sending' | 'receiving' | 'admin'> {
  return PORTAL_ACCESS[role] ?? ['sending'];
}

/** Returns the first portal a user should land on after login */
export function homePortal(role: string): 'sending' | 'receiving' | 'admin' {
  const portals = allowedPortals(role);
  // Prefer sending > receiving > admin as default home
  if (portals.includes('sending'))   return 'sending';
  if (portals.includes('receiving')) return 'receiving';
  return 'admin';
}

/** Whether a role belongs to the receiving side */
export function isReceivingRole(role: string): boolean {
  return ['RECEIVING_ADMIN', 'MANAGER', 'TELLER'].includes(role);
}

/** Whether a role belongs to the sending side */
export function isSendingRole(role: string): boolean {
  return ['SENDING_ADMIN', 'SENDING_AGENT', 'ADMIN'].includes(role);
}
