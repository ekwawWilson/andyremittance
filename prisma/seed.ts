/// <reference types="node" />

/**
 * Andy D Enterprise — Master Seed
 *
 * Covers:
 *  1. Users (all roles)
 *  2. Receiving points (branches)
 *  3. Chart of Accounts (company-wide ledger accounts)
 *  4. Branch vault accounts
 *  5. Teller till accounts
 *  6. Senders & receivers
 *  7. Role permission defaults
 *
 * Fully idempotent — safe to re-run at any time.
 *
 * Usage:
 *   npx prisma db seed
 *   — or —
 *   npx tsx prisma/seed.ts
 */

import { PrismaClient, UserRole, LedgerAccountType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

// ─── 1. USERS ────────────────────────────────────────────────────────────────

async function seedUsers(accraId: string, kumasiId: string) {
  const pw = await hash('Andy@2025');

  const users = [
    {
      email: 'edward.wilson@andydenterprise.com',
      firstName: 'Edward',
      lastName: 'Wilson',
      role: UserRole.SUPER_ADMIN,
      receivingPointId: null,
    },
    {
      email: 'jeffery.asante@andydenterprise.com',
      firstName: 'Jeffery',
      lastName: 'Asante',
      role: UserRole.SENDING_ADMIN,
      receivingPointId: null,
    },
    {
      email: 'denise.asante@andydenterprise.com',
      firstName: 'Denise',
      lastName: 'Asante',
      role: UserRole.SENDING_ADMIN,
      receivingPointId: null,
    },
    {
      email: 'joseph.asenso@andydenterprise.com',
      firstName: 'Joseph',
      lastName: 'Asenso Twum',
      role: UserRole.RECEIVING_ADMIN,
      receivingPointId: accraId,
    },
    {
      email: 'kofi.boateng@andydenterprise.com',
      firstName: 'Kofi',
      lastName: 'Boateng',
      role: UserRole.RECEIVING_ADMIN,
      receivingPointId: kumasiId,
    },
    {
      email: 'angela.agyeman@andydenterprise.com',
      firstName: 'Angela',
      lastName: 'Agyeman Sasu',
      role: UserRole.TELLER,
      receivingPointId: accraId,
    },
    {
      email: 'aquila.wiafe@andydenterprise.com',
      firstName: 'Aquila',
      lastName: 'Wiafe',
      role: UserRole.TELLER,
      receivingPointId: accraId,
    },
    {
      email: 'kofi.kumasi@andydenterprise.com',
      firstName: 'Kofi',
      lastName: 'Kumasi',
      role: UserRole.TELLER,
      receivingPointId: kumasiId,
    },
  ];

  const created: Record<string, string> = {};

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        password: pw,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: true,
        ...(u.receivingPointId ? { receivingPointId: u.receivingPointId } : {}),
      },
    });
    created[u.email] = user.id;
    console.log(`  ✓ ${u.role.padEnd(18)} ${u.email}`);
  }

  return created;
}

// ─── 2. RECEIVING POINTS ─────────────────────────────────────────────────────

async function seedReceivingPoints() {
  const points = [
    { name: 'Accra Main Branch',    code: 'ACCRA',   address: 'Kantamanto Opposite Ecobank ', city: 'Accra',   phone: '+233 592761463 ' },
    { name: 'Kumasi Branch',        code: 'KUMASI',  address: 'Ashtown, Opposite AshTown Post Office',         city: 'Kumasi',  phone: '+233 20 815 3941' },
  ];

  const ids: Record<string, string> = {};

  for (const p of points) {
    const point = await prisma.receivingPoint.upsert({
      where: { code: p.code },
      update: {},
      create: { ...p, country: 'Ghana', isActive: true },
    });
    ids[p.code] = point.id;
    console.log(`  ✓ ${p.code.padEnd(8)} ${p.name}`);
  }

  return ids;
}

// ─── 3. CHART OF ACCOUNTS (company-wide) ─────────────────────────────────────

async function seedChartOfAccounts() {
  const accounts = [
    // ── CAD / Sending side ──
    { code: 'CASH-CAD',            name: 'Company Cash — CAD',                    type: LedgerAccountType.COMPANY_CASH,   group: '1000', number: '1100', currency: 'CAD', description: 'Primary CAD cash account. Debited when senders pay.' },
    { code: 'BANK-CLEARING',       name: 'Bank / External Clearing',              type: LedgerAccountType.BANK_CLEARING,  group: '1000', number: '1120', currency: 'CAD', description: 'Clearing account for bank transfers and external cash loads.' },
    { code: 'MOMO-CLEARING',       name: 'Mobile Money Clearing',                 type: LedgerAccountType.MOMO_CLEARING,  group: '1000', number: '1130', currency: 'CAD', description: 'Clearing account for mobile money remittance receipts.' },
    { code: 'RECEIVABLE-CAD',      name: 'Sender Receivables — CAD',              type: LedgerAccountType.RECEIVABLE,     group: '3000', number: '3100', currency: 'CAD', description: 'Consolidated receivable from senders with outstanding balances.' },
    { code: 'INCOME-STANDARD',     name: 'Remittance Income — Standard',          type: LedgerAccountType.INCOME,         group: '6000', number: '6100', currency: 'CAD', description: 'Revenue from standard (EOD batch) remittance transactions.' },
    { code: 'INCOME-ADDITIONAL',   name: 'Remittance Income — Additional',        type: LedgerAccountType.INCOME,         group: '6000', number: '6200', currency: 'CAD', description: 'Revenue from additional (real-time) remittance transactions.' },
    { code: 'EQUITY-RETAINED-CAD', name: 'Retained Earnings — CAD',               type: LedgerAccountType.EQUITY,         group: '5000', number: '5100', currency: 'CAD', description: 'Accumulated retained earnings on the CAD side.' },
    // ── CAD Operating Expenses ──
    { code: 'OPEX-GENERAL-CAD',   name: 'General Operating Expense — CAD',        type: LedgerAccountType.EXPENSE,        group: '8000', number: '8100', currency: 'CAD', description: 'General operating expenses paid from CAD cash (rent, utilities, etc.).' },
    { code: 'OPEX-SALARY-CAD',    name: 'Staff Salaries & Wages — CAD',            type: LedgerAccountType.EXPENSE,        group: '8000', number: '8200', currency: 'CAD', description: 'Salary and wage payments made from CAD cash.' },
    { code: 'OPEX-BANK-FEE-CAD',  name: 'Bank Charges & Fees — CAD',               type: LedgerAccountType.EXPENSE,        group: '8000', number: '8300', currency: 'CAD', description: 'Bank transfer fees and charges on CAD side.' },
    { code: 'OPEX-OTHER-CAD',     name: 'Other Operating Expense — CAD',           type: LedgerAccountType.EXPENSE,        group: '8000', number: '8900', currency: 'CAD', description: 'Miscellaneous operating expenses on the CAD side.' },
    // ── GHS / Receiving side ──
    { code: 'DISBURSE-EXPENSE',      name: 'Cash Disbursement Expense — GHS',       type: LedgerAccountType.EXPENSE, group: '7000', number: '7100', currency: 'GHS', description: 'Expense debited when tellers disburse cash to receivers.' },
    { code: 'BANK-DISBURSE-EXPENSE', name: 'Bank Transfer Disbursement — GHS',      type: LedgerAccountType.EXPENSE, group: '7000', number: '7200', currency: 'GHS', description: 'Expense for bank-mode disbursements.' },
    { code: 'MOMO-DISBURSE-EXPENSE', name: 'MoMo Disbursement Expense — GHS',       type: LedgerAccountType.EXPENSE, group: '7000', number: '7300', currency: 'GHS', description: 'Expense for mobile money disbursements.' },
    { code: 'VARIANCE-EXPENSE',      name: 'Cash Variance Write-off — GHS',         type: LedgerAccountType.EXPENSE, group: '7400', number: '7410', currency: 'GHS', description: 'Expense for teller cash shortages on reconciliation.' },
    { code: 'ADDITIONAL_TILL',       name: 'Additional Till — Immediate Payments',  type: LedgerAccountType.ADDITIONAL_TILL, group: '2000', number: '2120', currency: 'GHS', description: 'Dedicated GHS till for immediate/additional transaction disbursements.' },
    { code: 'EQUITY-RETAINED-GHS',   name: 'Retained Earnings — GHS',              type: LedgerAccountType.EQUITY,  group: '5000', number: '5200', currency: 'GHS', description: 'Accumulated retained earnings on the GHS side.' },
  ] as const;

  for (const a of accounts) {
    await prisma.ledgerAccount.upsert({
      where: { accountCode: a.code },
      update: { accountName: a.name, accountGroup: a.group, accountNumber: a.number, description: a.description },
      create: {
        accountCode: a.code,
        accountName: a.name,
        accountType: a.type,
        accountGroup: a.group,
        accountNumber: a.number,
        description: a.description,
        currency: a.currency,
        balance: 0,
        isActive: true,
      },
    });
    console.log(`  ✓ ${a.number}  ${a.name}`);
  }
}

// ─── 4. BRANCH VAULTS ────────────────────────────────────────────────────────

async function seedVaults(pointIds: Record<string, string>) {
  const vaults = [
    { code: 'VAULT-ACCRA',   name: 'Accra Vault',   pointCode: 'ACCRA' },
    { code: 'VAULT-KUMASI',  name: 'Kumasi Vault',  pointCode: 'KUMASI' },
  ];

  for (const v of vaults) {
    await prisma.ledgerAccount.upsert({
      where: { accountCode: v.code },
      update: {},
      create: {
        accountType: LedgerAccountType.COMPANY_VAULT,
        accountName: v.name,
        accountCode: v.code,
        receivingPointId: pointIds[v.pointCode],
        balance: 0,
        currency: 'GHS',
        isActive: true,
      },
    });
    console.log(`  ✓ ${v.code}`);
  }
}

// ─── 5. TELLER TILLS ─────────────────────────────────────────────────────────

async function seedTills(userIds: Record<string, string>) {
  const tellers = [
    { email: 'angela.agyeman@andydenterprise.com',  name: 'Angela Agyeman Sasu' },
    { email: 'aquila.wiafe@andydenterprise.com',    name: 'Aquila Wiafe' },
    { email: 'kofi.kumasi@andydenterprise.com',     name: 'Kofi Kumasi' },
  ];

  for (const t of tellers) {
    const userId = userIds[t.email];
    const code = `TILL-${userId.substring(0, 8)}`;
    await prisma.ledgerAccount.upsert({
      where: { accountCode: code },
      update: {},
      create: {
        accountType: LedgerAccountType.TELLER_TILL,
        accountName: `Till — ${t.name}`,
        accountCode: code,
        userId,
        balance: 0,
        currency: 'GHS',
        isActive: true,
      },
    });
    console.log(`  ✓ ${code}  (${t.name})`);
  }
}

// ─── 6. ROLE PERMISSION DEFAULTS ─────────────────────────────────────────────

async function seedRoles() {
  const roles: Record<string, string[]> = {
    SUPER_ADMIN:      [],
    ADMIN:            ['MANAGE_USERS','MANAGE_EXCHANGE_RATES','MANAGE_RECEIVING_POINTS','MANAGE_LEDGER_ACCOUNTS','GRANT_PERMISSIONS','SYNC_TRANSACTIONS','VIEW_ALL_TRANSACTIONS','VIEW_REPORTS','VIEW_AGENT_REPORTS','VIEW_PAYMENT_REPORTS','VIEW_LEDGER_STATEMENT','EDIT_TRANSACTIONS','DELETE_TRANSACTIONS','CREATE_TRANSACTIONS','CREATE_SENDERS','VIEW_SENDERS','EDIT_SENDERS','CREATE_RECEIVERS','VIEW_RECEIVERS','EDIT_RECEIVERS','VIEW_RECONCILIATIONS','APPROVE_RECONCILIATION','MANAGE_VAULT_TRANSFERS','MARK_PAID','FLAG_TRANSACTION'],
    SENDING_ADMIN:    ['MANAGE_USERS','MANAGE_EXCHANGE_RATES','SYNC_TRANSACTIONS','VIEW_ALL_TRANSACTIONS','VIEW_REPORTS','VIEW_AGENT_REPORTS','VIEW_PAYMENT_REPORTS','VIEW_LEDGER_STATEMENT','EDIT_TRANSACTIONS','DELETE_TRANSACTIONS','CREATE_TRANSACTIONS','CREATE_SENDERS','VIEW_SENDERS','EDIT_SENDERS','CREATE_RECEIVERS','VIEW_RECEIVERS','EDIT_RECEIVERS'],
    RECEIVING_ADMIN:  ['MANAGE_USERS','MANAGE_RECEIVING_POINTS','MANAGE_LEDGER_ACCOUNTS','SYNC_TRANSACTIONS','VIEW_ALL_TRANSACTIONS','VIEW_REPORTS','VIEW_PAYMENT_REPORTS','VIEW_LEDGER_STATEMENT','VIEW_RECONCILIATIONS','APPROVE_RECONCILIATION','MANAGE_VAULT_TRANSFERS','MARK_PAID','MANAGE_TELLER_TILL','CREATE_RECONCILIATION','FLAG_TRANSACTION'],
    MANAGER:          ['SYNC_TRANSACTIONS','VIEW_ALL_TRANSACTIONS','VIEW_REPORTS','VIEW_AGENT_REPORTS','VIEW_PAYMENT_REPORTS','VIEW_LEDGER_STATEMENT','MANAGE_VAULT_TRANSFERS','APPROVE_RECONCILIATION','VIEW_RECONCILIATIONS','CREATE_TRANSACTIONS','CREATE_SENDERS','VIEW_SENDERS','EDIT_SENDERS','CREATE_RECEIVERS','VIEW_RECEIVERS','EDIT_RECEIVERS','EDIT_TRANSACTIONS','DELETE_TRANSACTIONS','MARK_PAID'],
    TELLER:           ['MARK_PAID','MANAGE_TELLER_TILL','CREATE_RECONCILIATION','VIEW_RECONCILIATIONS','VIEW_ALL_TRANSACTIONS','VIEW_SENDERS','VIEW_RECEIVERS'],
    SENDING_AGENT:    ['CREATE_TRANSACTIONS','CREATE_SENDERS','VIEW_SENDERS','VIEW_RECEIVERS','CREATE_RECEIVERS','VIEW_RECONCILIATIONS'],
  };

  for (const [name, permissions] of Object.entries(roles)) {
    await prisma.role.upsert({
      where: { name },
      update: { permissions },
      create: { name, permissions },
    });
    console.log(`  ✓ ${name}`);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nAndy D Enterprise — Database Seed\n');

  console.log('Receiving points…');
  const pointIds = await seedReceivingPoints();

  console.log('\nUsers…');
  const userIds = await seedUsers(pointIds['ACCRA'], pointIds['KUMASI']);

  console.log('\nChart of Accounts…');
  await seedChartOfAccounts();

  console.log('\nBranch vaults…');
  await seedVaults(pointIds);

  console.log('\nTeller tills…');
  await seedTills(userIds);

  console.log('\nRole defaults…');
  await seedRoles();

  console.log('\n─────────────────────────────────────────────');
  console.log('Seed complete.\n');
  console.log('Login credentials (all roles use the same password):');
  console.log('  Password:               Andy@2025\n');
  console.log('  SUPER_ADMIN             edward.wilson@andydenterprise.com');
  console.log('  SENDING_ADMIN           jeffery.asante@andydenterprise.com');
  console.log('  SENDING_ADMIN           denise.asante@andydenterprise.com');
  console.log('  RECEIVING_ADMIN (Accra) joseph.asenso@andydenterprise.com');
  console.log('  RECEIVING_ADMIN (Kumasi)kofi.boateng@andydenterprise.com');
  console.log('  TELLER (Accra)          angela.agyeman@andydenterprise.com');
  console.log('  TELLER (Accra)          aquila.wiafe@andydenterprise.com');
  console.log('  TELLER (Kumasi)         kofi.kumasi@andydenterprise.com');
  console.log('─────────────────────────────────────────────\n');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
