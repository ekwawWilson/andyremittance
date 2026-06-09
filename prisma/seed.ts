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
      email: 'admin@andydenterprise.com',
      firstName: 'Andy',
      lastName: 'D',
      role: UserRole.SUPER_ADMIN,
      receivingPointId: null,
    },
    {
      email: 'sending.admin@andydenterprise.com',
      firstName: 'James',
      lastName: 'Osei',
      role: UserRole.SENDING_ADMIN,
      receivingPointId: null,
    },
    {
      email: 'receiving.admin@andydenterprise.com',
      firstName: 'Abena',
      lastName: 'Asante',
      role: UserRole.RECEIVING_ADMIN,
      receivingPointId: accraId,
    },
    {
      email: 'agent@andydenterprise.com',
      firstName: 'John',
      lastName: 'Smith',
      role: UserRole.SENDING_AGENT,
      receivingPointId: null,
    },
    {
      email: 'manager.accra@andydenterprise.com',
      firstName: 'Kofi',
      lastName: 'Mensah',
      role: UserRole.MANAGER,
      receivingPointId: accraId,
    },
    {
      email: 'teller.accra@andydenterprise.com',
      firstName: 'Ama',
      lastName: 'Owusu',
      role: UserRole.TELLER,
      receivingPointId: accraId,
    },
    {
      email: 'teller.kumasi@andydenterprise.com',
      firstName: 'Kweku',
      lastName: 'Boateng',
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
    { name: 'Accra Main Branch',    code: 'ACCRA',   address: '123 Independence Avenue', city: 'Accra',   phone: '+233 20 123 4567' },
    { name: 'Kumasi Branch',        code: 'KUMASI',  address: '456 Kejetia Road',         city: 'Kumasi',  phone: '+233 20 765 4321' },
    { name: 'Tamale Branch',        code: 'TAMALE',  address: '789 Central Market Road',  city: 'Tamale',  phone: '+233 20 555 1234' },
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
    { code: 'VAULT-TAMALE',  name: 'Tamale Vault',  pointCode: 'TAMALE' },
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
    { email: 'teller.accra@andydenterprise.com',  name: 'Ama Owusu' },
    { email: 'teller.kumasi@andydenterprise.com', name: 'Kweku Boateng' },
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

// ─── 6. SENDERS & RECEIVERS ──────────────────────────────────────────────────

const SENDERS = [
  {
    firstName: 'Kwame',  lastName: 'Asante',    email: 'kwame.asante@gmail.com',
    phone: '+1 416 234 5678', address: '45 Eglinton Ave E',   city: 'Toronto',
    idType: 'Passport',          idNumber: 'GH-PA-001122', creditLimit: 3000,
    receivers: [
      { firstName: 'Adwoa',  lastName: 'Asante',   phone: '+233 24 556 7890', email: 'adwoa.asante@gmail.com', preferredMethod: 'CASH',  relationshipToSender: 'Wife' },
      { firstName: 'Kofi',   lastName: 'Asante',   phone: '+233 20 112 3344', preferredMethod: 'MOMO', momoNumber: '+233 20 112 3344', momoProvider: 'MTN', relationshipToSender: 'Brother' },
    ],
  },
  {
    firstName: 'Abena',  lastName: 'Mensah',    email: 'abena.mensah@yahoo.com',
    phone: '+1 647 890 1234', address: '12 Bloor St W',        city: 'Toronto',
    idType: "Driver's License",  idNumber: 'DL-ON-445566', creditLimit: 2000,
    receivers: [
      { firstName: 'Yaw',    lastName: 'Mensah',   phone: '+233 26 778 9900', preferredMethod: 'BANK', bankName: 'GCB Bank', bankAccount: '1234567890', bankBranch: 'Kumasi Main', relationshipToSender: 'Father' },
      { firstName: 'Ama',    lastName: 'Mensah',   phone: '+233 54 221 3344', preferredMethod: 'CASH', relationshipToSender: 'Mother' },
    ],
  },
  {
    firstName: 'Ekow',   lastName: 'Boateng',   email: 'ekow.boateng@hotmail.com',
    phone: '+1 905 345 6789', address: '88 Dixon Rd',          city: 'Etobicoke',
    idType: 'Passport',          idNumber: 'GH-PA-334455', creditLimit: 5000,
    receivers: [
      { firstName: 'Efua',   lastName: 'Boateng',  phone: '+233 27 654 3210', preferredMethod: 'MOMO', momoNumber: '+233 27 654 3210', momoProvider: 'Vodafone', relationshipToSender: 'Sister' },
    ],
  },
  {
    firstName: 'Adjoa',  lastName: 'Darko',     email: 'adjoa.darko@gmail.com',
    phone: '+1 416 567 8901', address: '330 Wilson Ave',       city: 'North York',
    idType: "Driver's License",  idNumber: 'DL-ON-778899', creditLimit: 1500,
    receivers: [
      { firstName: 'Kojo',   lastName: 'Darko',    phone: '+233 23 444 5566', preferredMethod: 'CASH', relationshipToSender: 'Husband' },
      { firstName: 'Akua',   lastName: 'Darko',    phone: '+233 50 998 7766', preferredMethod: 'MOMO', momoNumber: '+233 50 998 7766', momoProvider: 'AirtelTigo', relationshipToSender: 'Daughter' },
    ],
  },
  {
    firstName: 'Nana',   lastName: 'Osei',      email: 'nana.osei@outlook.com',
    phone: '+1 647 123 4567', address: '19 Jane St',           city: 'Toronto',
    idType: 'Passport',          idNumber: 'GH-PA-556677', creditLimit: 4000,
    receivers: [
      { firstName: 'Akosua', lastName: 'Osei',     phone: '+233 24 321 0987', preferredMethod: 'BANK', bankName: 'Ecobank', bankAccount: '9876543210', bankBranch: 'Accra Central', relationshipToSender: 'Mother' },
      { firstName: 'Kweku',  lastName: 'Osei',     phone: '+233 55 876 5432', preferredMethod: 'CASH', relationshipToSender: 'Brother' },
      { firstName: 'Afia',   lastName: 'Osei',     phone: '+233 20 765 4321', preferredMethod: 'MOMO', momoNumber: '+233 20 765 4321', momoProvider: 'MTN', relationshipToSender: 'Sister' },
    ],
  },
  {
    firstName: 'Fiifi',  lastName: 'Amponsah',  email: 'fiifi.amponsah@gmail.com',
    phone: '+1 905 678 9012', address: '205 Rexdale Blvd',     city: 'Etobicoke',
    idType: "Driver's License",  idNumber: 'DL-ON-990011', creditLimit: 2500,
    receivers: [
      { firstName: 'Maame', lastName: 'Amponsah',  phone: '+233 26 543 2109', preferredMethod: 'CASH', relationshipToSender: 'Wife' },
    ],
  },
  {
    firstName: 'Akwasi', lastName: 'Owusu',     email: 'akwasi.owusu@yahoo.com',
    phone: '+1 416 789 0123', address: '77 Lawrence Ave W',    city: 'Toronto',
    idType: 'Passport',          idNumber: 'GH-PA-112233', creditLimit: 3500,
    receivers: [
      { firstName: 'Serwa',  lastName: 'Owusu',    phone: '+233 27 432 1098', preferredMethod: 'BANK', bankName: 'Fidelity Bank', bankAccount: '1122334455', bankBranch: 'Kumasi Adum', relationshipToSender: 'Wife' },
      { firstName: 'Kofi',   lastName: 'Owusu Sr', phone: '+233 24 111 2233', preferredMethod: 'CASH', relationshipToSender: 'Father' },
    ],
  },
  {
    firstName: 'Esi',    lastName: 'Quaye',     email: 'esi.quaye@gmail.com',
    phone: '+1 647 234 5678', address: '500 Finch Ave W',      city: 'North York',
    idType: "Driver's License",  idNumber: 'DL-ON-223344', creditLimit: 2000,
    receivers: [
      { firstName: 'Kwabena', lastName: 'Quaye',   phone: '+233 54 333 4455', preferredMethod: 'MOMO', momoNumber: '+233 54 333 4455', momoProvider: 'MTN', relationshipToSender: 'Husband' },
    ],
  },
  {
    firstName: 'Michael', lastName: 'Johnson',  email: 'michael.johnson@email.com',
    phone: '+1 416 555 1234', address: '100 Queen Street West', city: 'Toronto',
    idType: 'Passport',          idNumber: 'AB123456',     creditLimit: 5000,
    receivers: [
      { firstName: 'Akosua', lastName: 'Boateng',  phone: '+233 20 987 6543', email: 'akosua.boateng@email.com', preferredMethod: 'CASH', relationshipToSender: 'Sister' },
    ],
  },
];

async function seedSenders(agentId: string) {
  let senderCount = 0;
  let receiverCount = 0;

  for (const s of SENDERS) {
    const existing = await prisma.sender.findFirst({ where: { email: s.email } });
    if (existing) {
      console.log(`  – skipped  ${s.firstName} ${s.lastName} (exists)`);
      continue;
    }

    const sender = await prisma.sender.create({
      data: {
        firstName: s.firstName, lastName: s.lastName,
        email: s.email, phone: s.phone,
        address: s.address, city: s.city, country: 'Canada',
        idType: s.idType, idNumber: s.idNumber,
        creditLimit: s.creditLimit,
        createdById: agentId,
      },
    });

    await prisma.ledgerAccount.create({
      data: {
        accountType: LedgerAccountType.SENDER,
        accountName: `${sender.firstName} ${sender.lastName}`,
        accountCode: `SENDER-${sender.id.substring(0, 8)}`,
        senderId: sender.id,
        balance: 0,
        currency: 'CAD',
      },
    });

    for (const r of s.receivers) {
      await prisma.receiver.create({
        data: {
          firstName: r.firstName, lastName: r.lastName,
          phone: r.phone, email: (r as { email?: string }).email,
          preferredMethod: r.preferredMethod,
          bankName: (r as { bankName?: string }).bankName,
          bankAccount: (r as { bankAccount?: string }).bankAccount,
          bankBranch: (r as { bankBranch?: string }).bankBranch,
          momoNumber: (r as { momoNumber?: string }).momoNumber,
          momoProvider: (r as { momoProvider?: string }).momoProvider,
          relationshipToSender: r.relationshipToSender,
          senderId: sender.id,
        },
      });
      receiverCount++;
    }

    console.log(`  ✓ ${sender.firstName} ${sender.lastName} — ${s.receivers.length} receiver(s)`);
    senderCount++;
  }

  return { senderCount, receiverCount };
}

// ─── 7. ROLE PERMISSION DEFAULTS ─────────────────────────────────────────────

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

  console.log('\nSenders & receivers…');
  const { senderCount, receiverCount } = await seedSenders(userIds['agent@andydenterprise.com']);
  console.log(`  → ${senderCount} sender(s), ${receiverCount} receiver(s)`);

  console.log('\nRole defaults…');
  await seedRoles();

  console.log('\n─────────────────────────────────────────────');
  console.log('Seed complete.\n');
  console.log('Login credentials (all roles use the same password):');
  console.log('  Password:          Andy@2025\n');
  console.log('  SUPER_ADMIN        admin@andydenterprise.com');
  console.log('  SENDING_ADMIN      sending.admin@andydenterprise.com');
  console.log('  RECEIVING_ADMIN    receiving.admin@andydenterprise.com');
  console.log('  SENDING_AGENT      agent@andydenterprise.com');
  console.log('  MANAGER (Accra)    manager.accra@andydenterprise.com');
  console.log('  TELLER  (Accra)    teller.accra@andydenterprise.com');
  console.log('  TELLER  (Kumasi)   teller.kumasi@andydenterprise.com');
  console.log('─────────────────────────────────────────────\n');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
