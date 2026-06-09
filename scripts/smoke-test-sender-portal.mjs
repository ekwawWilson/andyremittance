import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envPath = path.join(repoRoot, '.env');

function readEnvValue(key) {
  if (!fs.existsSync(envPath)) return undefined;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    if (match[1].trim() !== key) continue;
    const raw = match[2].trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      return raw.slice(1, -1);
    }
    return raw;
  }
  return undefined;
}

if (!process.env.DATABASE_URL) {
  const databaseUrl = readEnvValue('DATABASE_URL');
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
}

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DEFAULT_PASSWORD = process.env.SMOKE_TEST_PASSWORD || 'Andy@2025';
const today = new Date();
const runId = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}${String(today.getUTCHours()).padStart(2, '0')}${String(today.getUTCMinutes()).padStart(2, '0')}${String(today.getUTCSeconds()).padStart(2, '0')}`;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(`${message}. Expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > 0.0001) {
    fail(`${message}. Expected ${expected}, got ${actual}`);
  }
}

function utcDayBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

function buildPhone(seed) {
  const numeric = seed.replace(/\D/g, '').slice(-7).padStart(7, '0');
  return `647555${numeric}`;
}

function buildEmail(prefix) {
  return `${prefix}.${runId}@example.com`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(endpoint, { token, method = 'GET', body } = {}) {
  const url = new URL(endpoint, BASE_URL);
  let response;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(1000 * attempt);
      }
    }
  }

  if (!response) {
    const details = lastError instanceof Error
      ? `${lastError.message}${lastError.cause ? ` | cause: ${String(lastError.cause)}` : ''}`
      : String(lastError);
    fail(`Network request failed for ${url.toString()}: ${details}`);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    fail(`Non-JSON response from ${endpoint}: ${text || response.statusText}`);
  }

  return { response, payload };
}

async function expectSuccess(label, endpoint, options) {
  const { response, payload } = await apiRequest(endpoint, options);
  if (!response.ok || !payload.success) {
    fail(`${label} failed (${response.status}): ${payload.error || payload.message || JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function expectFailure(label, endpoint, options, expectedStatus) {
  const { response, payload } = await apiRequest(endpoint, options);
  if (response.ok && payload.success) {
    fail(`${label} unexpectedly succeeded`);
  }
  if (expectedStatus !== undefined) {
    assertEqual(response.status, expectedStatus, `${label} returned an unexpected status`);
  }
  return payload;
}

async function login(email) {
  const data = await expectSuccess(`login ${email}`, '/api/auth/login', {
    method: 'POST',
    body: { email, password: DEFAULT_PASSWORD },
  });
  return {
    token: data.token,
    user: data.user,
  };
}

async function createSender(token, prefix) {
  return expectSuccess(`create sender ${prefix}`, '/api/senders', {
    token,
    method: 'POST',
    body: {
      firstName: `${prefix}Sender`,
      lastName: runId.slice(-6),
      email: buildEmail(prefix.toLowerCase()),
      phone: buildPhone(prefix + runId),
      address: 'Smoke Test Street',
      city: 'Toronto',
      country: 'Canada',
      idType: 'Passport',
      idNumber: `${prefix.toUpperCase()}-${runId}`,
      creditLimit: 5000,
    },
  });
}

async function createReceiver(token, senderId, prefix, preferredMethod = 'CASH') {
  return expectSuccess(`create receiver ${prefix}`, '/api/receivers', {
    token,
    method: 'POST',
    body: {
      senderId,
      firstName: `${prefix}Receiver`,
      lastName: runId.slice(-5),
      phone: buildPhone(prefix + runId + '9'),
      email: buildEmail(`${prefix.toLowerCase()}-receiver`),
      preferredMethod,
      relationshipToSender: 'Family',
      bankName: preferredMethod === 'BANK' ? 'GCB Bank' : null,
      bankAccount: preferredMethod === 'BANK' ? `ACC-${runId}` : null,
      bankBranch: preferredMethod === 'BANK' ? 'Accra Main' : null,
      momoNumber: preferredMethod === 'MOMO' ? `024${runId.slice(-7)}` : null,
      momoProvider: preferredMethod === 'MOMO' ? 'MTN' : null,
    },
  });
}

async function getSenderBalance(senderId) {
  const ledger = await prisma.ledgerAccount.findFirst({
    where: { senderId },
    select: { balance: true },
  });
  return Number(ledger?.balance || 0);
}

async function getCashCadBalance() {
  const ledger = await prisma.ledgerAccount.findUnique({
    where: { accountCode: 'CASH-CAD' },
    select: { balance: true },
  });
  return Number(ledger?.balance || 0);
}

async function main() {
  log('1. Logging in as sender roles');
  const agent = await login('agent@andydenterprise.com');
  const sendingAdmin = await login('sending.admin@andydenterprise.com');

  log('2. Loading baseline data');
  const [exchangeRate, receivingPoint, existingAdminTx] = await Promise.all([
    prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { date: 'desc' } }),
    prisma.receivingPoint.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    prisma.transaction.findFirst({
      where: { createdById: { not: agent.user.id } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  assert(exchangeRate, 'No active exchange rate found');
  assert(receivingPoint, 'No active receiving point found');
  assert(existingAdminTx, 'Expected at least one transaction created by another user');

  log('3. Creating isolated sender fixtures');
  const agentSender = await createSender(agent.token, 'Agent');
  const agentReceiver1 = await createReceiver(agent.token, agentSender.id, 'AgentOne');
  const agentReceiver2 = await createReceiver(agent.token, agentSender.id, 'AgentTwo');
  const foreignSender = await createSender(agent.token, 'Foreign');
  const foreignReceiver = await createReceiver(agent.token, foreignSender.id, 'ForeignOne');
  const adminSender = await createSender(sendingAdmin.token, 'Admin');
  const adminReceiver = await createReceiver(sendingAdmin.token, adminSender.id, 'AdminOne', 'BANK');

  log('4. Verifying single-transaction guard rails');
  const overrideDenied = await expectFailure(
    'agent override create',
    '/api/transactions',
    {
      token: agent.token,
      method: 'POST',
      body: {
        senderId: agentSender.id,
        receiverId: agentReceiver1.id,
        cadAmount: 91,
        exchangeRateId: exchangeRate.id,
        exchangeRateOverride: Number(exchangeRate.cadToGhs) + 0.3,
        paymentMethod: 'CASH',
        amountPaidCAD: 20,
        receivingMode: 'CASH',
        receivingPointId: receivingPoint.id,
        transactionDate: today.toISOString(),
        codeType: 'STANDARD',
        cashPhoneNumber: buildPhone(`override${runId}`),
      },
    },
    403
  );
  assert(
    (overrideDenied.error || '').includes('permission') || (overrideDenied.message || '').includes('permission'),
    'Override denial should mention permissions'
  );

  const wrongReceiver = await expectFailure(
    'wrong receiver create',
    '/api/transactions',
    {
      token: agent.token,
      method: 'POST',
      body: {
        senderId: agentSender.id,
        receiverId: foreignReceiver.id,
        cadAmount: 92,
        exchangeRateId: exchangeRate.id,
        paymentMethod: 'CASH',
        amountPaidCAD: 20,
        receivingMode: 'CASH',
        receivingPointId: receivingPoint.id,
        transactionDate: today.toISOString(),
        codeType: 'STANDARD',
        cashPhoneNumber: buildPhone(`wrong${runId}`),
      },
    }
  );
  assert(
    (wrongReceiver.error || '').includes('does not belong'),
    'Wrong receiver rejection should enforce sender ownership'
  );

  log('5. Creating an agent transaction and validating balance replay');
  const senderBalanceBefore = await getSenderBalance(agentSender.id);
  const cashBefore = await getCashCadBalance();

  const agentTx = await expectSuccess('create agent transaction', '/api/transactions', {
    token: agent.token,
    method: 'POST',
    body: {
      senderId: agentSender.id,
      receiverId: agentReceiver1.id,
      cadAmount: 100,
      exchangeRateId: exchangeRate.id,
      paymentMethod: 'CASH',
      amountPaidCAD: 40,
      receivingMode: 'CASH',
      receivingPointId: receivingPoint.id,
      transactionDate: today.toISOString(),
      codeType: 'STANDARD',
      cashPhoneNumber: buildPhone(`agent-tx${runId}`),
      notes: `smoke-agent-${runId}`,
    },
  });
  assertEqual(agentTx.status, 'PARTIAL', 'Agent transaction should start as PARTIAL');

  const senderBalanceAfterCreate = await getSenderBalance(agentSender.id);
  const cashAfterCreate = await getCashCadBalance();
  assertClose(senderBalanceAfterCreate, senderBalanceBefore - 60, 'Sender balance should reflect unpaid amount after create');
  assertClose(cashAfterCreate, cashBefore + 40, 'Cash ledger should reflect the paid amount after create');

  log('6. Verifying list scoping and sending-admin detail access');
  const scopedList = await expectSuccess(
    'agent scoped list',
    `/api/transactions?createdById=${encodeURIComponent(sendingAdmin.user.id)}&page=1&limit=50`,
    { token: agent.token }
  );
  const scopedIds = new Set(scopedList.transactions.map((transaction) => transaction.id));
  assert(scopedIds.has(agentTx.id), 'Agent should still see their own transaction in scoped list');
  assert(!scopedIds.has(existingAdminTx.id), 'Agent must not be able to fetch another user’s transactions via createdById');

  const adminView = await expectSuccess('sending admin detail view', `/api/transactions/${agentTx.id}`, {
    token: sendingAdmin.token,
  });
  assertEqual(adminView.id, agentTx.id, 'Sending admin should be able to open another user’s transaction detail');

  log('7. Editing, collecting remaining, and cancelling the agent transaction');
  const editedTx = await expectSuccess(`edit transaction ${agentTx.id}`, `/api/transactions/${agentTx.id}`, {
    token: sendingAdmin.token,
    method: 'PATCH',
    body: {
      cadAmount: 120,
      amountPaidCAD: 50,
      notes: `smoke-agent-edit-${runId}`,
    },
  });
  assertEqual(editedTx.status, 'PARTIAL', 'Edited transaction should remain PARTIAL');
  assertEqual(Number(editedTx.cadAmount), 120, 'Edited transaction should update CAD amount');
  assertEqual(Number(editedTx.amountPaidCAD), 50, 'Edited transaction should update amount paid');

  const senderBalanceAfterEdit = await getSenderBalance(agentSender.id);
  const cashAfterEdit = await getCashCadBalance();
  assertClose(senderBalanceAfterEdit, senderBalanceBefore - 70, 'Sender balance should be recalculated after edit');
  assertClose(cashAfterEdit, cashBefore + 50, 'Cash ledger should be recalculated after edit');

  const collectedTx = await expectSuccess(
    `collect remaining ${agentTx.id}`,
    `/api/transactions/${agentTx.id}/collect-remaining`,
    {
      token: sendingAdmin.token,
      method: 'POST',
      body: { paymentMethod: 'CASH' },
    }
  );
  assertEqual(collectedTx.status, 'PENDING', 'Collected transaction should return to PENDING');
  assertEqual(Number(collectedTx.amountPaidCAD), 120, 'Collect remaining should fully settle the sender-side amount');

  const senderBalanceAfterCollect = await getSenderBalance(agentSender.id);
  const cashAfterCollect = await getCashCadBalance();
  assertClose(senderBalanceAfterCollect, senderBalanceBefore, 'Sender balance should be restored after full collection');
  assertClose(cashAfterCollect, cashBefore + 120, 'Cash ledger should reflect full collection before cancel');

  await expectSuccess(`cancel transaction ${agentTx.id}`, `/api/transactions/${agentTx.id}`, {
    token: sendingAdmin.token,
    method: 'DELETE',
  });

  const cancelledTx = await prisma.transaction.findUnique({
    where: { id: agentTx.id },
    select: { status: true },
  });
  const senderBalanceAfterCancel = await getSenderBalance(agentSender.id);
  const cashAfterCancel = await getCashCadBalance();
  assertEqual(cancelledTx?.status, 'CANCELLED', 'Transaction should be marked CANCELLED');
  assertClose(senderBalanceAfterCancel, senderBalanceBefore, 'Sender balance should return to baseline after cancel');
  assertClose(cashAfterCancel, cashBefore, 'Cash ledger should return to baseline after cancel');

  log('8. Verifying multi-receiver validation and happy path');
  const underAllocated = await expectFailure(
    'under-allocated multi receiver create',
    '/api/transactions/multi-receiver',
    {
      token: agent.token,
      method: 'POST',
      body: {
        senderId: agentSender.id,
        cadAmount: 90,
        exchangeRateId: exchangeRate.id,
        paymentMethod: 'CASH',
        amountPaidCAD: 90,
        receivingMode: 'CASH',
        receivingPointId: receivingPoint.id,
        transactionDate: today.toISOString(),
        codeType: 'STANDARD',
        receivers: [
          { receiverId: agentReceiver1.id, ghsAmount: 300 },
          { receiverId: agentReceiver2.id, ghsAmount: 300 },
        ],
      },
    }
  );
  assert(
    (underAllocated.error || '').includes('must match') ||
      (underAllocated.error || '').includes('must equal'),
    'Multi-receiver rejection should require exact GHS allocation'
  );

  const foreignAllocation = await expectFailure(
    'cross-sender multi receiver create',
    '/api/transactions/multi-receiver',
    {
      token: agent.token,
      method: 'POST',
      body: {
        senderId: agentSender.id,
        cadAmount: 90,
        exchangeRateId: exchangeRate.id,
        paymentMethod: 'CASH',
        amountPaidCAD: 90,
        receivingMode: 'CASH',
        receivingPointId: receivingPoint.id,
        transactionDate: today.toISOString(),
        codeType: 'STANDARD',
        receivers: [
          { receiverId: agentReceiver1.id, ghsAmount: 360 },
          { receiverId: foreignReceiver.id, ghsAmount: 369 },
        ],
      },
    }
  );
  assert(
    (foreignAllocation.error || '').includes('must belong'),
    'Multi-receiver rejection should enforce sender ownership'
  );

  const validMulti = await expectSuccess('valid multi receiver create', '/api/transactions/multi-receiver', {
    token: agent.token,
    method: 'POST',
    body: {
      senderId: agentSender.id,
      cadAmount: 90,
      exchangeRateId: exchangeRate.id,
      paymentMethod: 'CASH',
      amountPaidCAD: 90,
      receivingMode: 'CASH',
      receivingPointId: receivingPoint.id,
      transactionDate: today.toISOString(),
      codeType: 'STANDARD',
      notes: `smoke-multi-${runId}`,
      receivers: [
        { receiverId: agentReceiver1.id, ghsAmount: 360 },
        { receiverId: agentReceiver2.id, ghsAmount: 369 },
      ],
    },
  });
  assertEqual(validMulti.transactionReceivers.length, 2, 'Valid multi-receiver transaction should store both allocations');

  log('9. Verifying BANK-mode validation, override persistence, and immediate sync conversion');
  const missingBankAccountName = await expectFailure(
    'missing bank account name create',
    '/api/transactions',
    {
      token: sendingAdmin.token,
      method: 'POST',
      body: {
        senderId: adminSender.id,
        receiverId: adminReceiver.id,
        cadAmount: 137,
        exchangeRateId: exchangeRate.id,
        exchangeRateOverride: Number(exchangeRate.cadToGhs) + 0.25,
        paymentMethod: 'E_TRANSFER',
        amountPaidCAD: 137,
        receivingMode: 'BANK',
        receivingPointId: receivingPoint.id,
        transactionDate: today.toISOString(),
        codeType: 'STANDARD',
        bankName: 'GCB Bank',
        bankAccountNo: `ACCT-${runId}`,
      },
    }
  );
  assert(
    (missingBankAccountName.error || '').includes('account name') ||
      (missingBankAccountName.error || '').includes('bank name'),
    'BANK transactions should require a bank account name'
  );

  const overrideRate = Number(exchangeRate.cadToGhs) + 0.25;
  const adminTx = await expectSuccess('create sending-admin transaction', '/api/transactions', {
    token: sendingAdmin.token,
    method: 'POST',
    body: {
      senderId: adminSender.id,
      receiverId: adminReceiver.id,
      cadAmount: 137,
      exchangeRateId: exchangeRate.id,
      exchangeRateOverride: overrideRate,
      paymentMethod: 'E_TRANSFER',
      amountPaidCAD: 137,
      receivingMode: 'BANK',
      receivingPointId: receivingPoint.id,
      transactionDate: today.toISOString(),
      codeType: 'STANDARD',
      bankName: 'GCB Bank',
      bankAccountNo: `ACCT-${runId}`,
      bankAccountName: 'Smoke Test Beneficiary',
      bankBranch: 'Accra Central',
      notes: `smoke-admin-${runId}`,
    },
  });
  assertEqual(Number(adminTx.exchangeRateUsed), overrideRate, 'Override rate should be persisted on the transaction');
  assertEqual(adminTx.bankAccountName, 'Smoke Test Beneficiary', 'Bank account name should be stored');

  const changedToImmediate = await expectSuccess(
    `change to immediate ${adminTx.id}`,
    `/api/transactions/${adminTx.id}`,
    {
      token: sendingAdmin.token,
      method: 'PATCH',
      body: { codeType: 'ADDITIONAL' },
    }
  );
  assertEqual(changedToImmediate.codeType, 'ADDITIONAL', 'Transaction type should change to ADDITIONAL');
  assertEqual(changedToImmediate.status, 'SYNCED', 'Transaction should sync immediately after change to ADDITIONAL');
  assertEqual(changedToImmediate.syncedToReceiving, true, 'Transaction should be marked synced to receiving');

  const lockedEdit = await expectFailure(
    'edit synced transaction',
    `/api/transactions/${adminTx.id}`,
    {
      token: sendingAdmin.token,
      method: 'PATCH',
      body: { notes: `locked-${runId}` },
    }
  );
  assert(
    (lockedEdit.error || '').includes('synced') || (lockedEdit.error || '').includes('locked'),
    'Synced transaction edits should be blocked'
  );

  log('10. Verifying agent report includeAll behavior');
  const { start, end } = utcDayBounds(today);
  const report = await expectSuccess(
    'sending admin report includeAll',
    `/api/reports/agent?agentId=${encodeURIComponent(sendingAdmin.user.id)}&startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}&includeAll=true`,
    { token: sendingAdmin.token }
  );
  assertEqual(report.pagination.total, report.transactions.length, 'includeAll report should return every matching transaction');
  assertEqual(report.pagination.limit, report.pagination.total, 'includeAll report limit should match total count');

  log('');
  log('Sender portal smoke test passed.');
  log(`Agent cancelled transaction: ${agentTx.transactionCode}`);
  log(`Multi-receiver transaction: ${validMulti.transactionCode}`);
  log(`Immediate transaction: ${adminTx.transactionCode}`);
}

try {
  await main();
} catch (error) {
  console.error('\nSender portal smoke test failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
