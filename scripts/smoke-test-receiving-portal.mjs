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
const now = new Date();
const runId = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPhone(seed) {
  const numeric = seed.replace(/\D/g, '').slice(-7).padStart(7, '0');
  return `647555${numeric}`;
}

function buildEmail(prefix) {
  return `${prefix}.${runId}@example.com`;
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
      if (attempt < 3) await sleep(1000 * attempt);
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
  } catch {
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
  const profile = await expectSuccess(`load profile ${email}`, '/api/auth/me', {
    token: data.token,
  });
  return {
    token: data.token,
    user: profile,
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
      address: 'Receiving Smoke Street',
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

async function createImmediateTransaction(token, senderId, receiverId, exchangeRateId, receivingPointId, prefix, receivingMode = 'CASH', cadAmount = 90) {
  return expectSuccess(`create immediate transaction ${prefix}`, '/api/transactions', {
    token,
    method: 'POST',
    body: {
      senderId,
      receiverId,
      cadAmount,
      exchangeRateId,
      paymentMethod: 'CASH',
      amountPaidCAD: cadAmount,
      receivingMode,
      receivingPointId,
      transactionDate: now.toISOString(),
      codeType: 'ADDITIONAL',
      cashPhoneNumber: receivingMode === 'CASH' ? buildPhone(prefix + runId) : undefined,
      notes: `smoke-receiving-${prefix}-${runId}`,
    },
  });
}

async function getLatestDisbursementDebitCode(transactionId) {
  const entry = await prisma.ledgerEntry.findFirst({
    where: {
      transactionId,
      entryType: 'DISBURSEMENT',
    },
    orderBy: { createdAt: 'desc' },
    select: { debitAccountId: true },
  });
  if (!entry) return null;
  const account = await prisma.ledgerAccount.findUnique({
    where: { id: entry.debitAccountId },
    select: { accountCode: true },
  });
  return account?.accountCode ?? null;
}

async function main() {
  log('1. Logging in as receiving roles');
  const sendingAdmin = await login('sending.admin@andydenterprise.com');
  const teller = await login('teller.accra@andydenterprise.com');
  const receivingAdmin = await login('receiving.admin@andydenterprise.com');

  assert(
    receivingAdmin.user.permissions.includes('FLAG_TRANSACTION'),
    'Receiving admin should have FLAG_TRANSACTION permission by default'
  );

  log('2. Loading baseline data');
  const [exchangeRate, accraPoint] = await Promise.all([
    prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { date: 'desc' } }),
    prisma.receivingPoint.findFirst({ where: { code: 'ACCRA' } }),
  ]);

  assert(exchangeRate, 'No active exchange rate found');
  assert(accraPoint, 'Accra receiving point not found');

  log('3. Creating isolated sender fixtures');
  const sender = await createSender(sendingAdmin.token, 'Receiving');
  const receiver = await createReceiver(sendingAdmin.token, sender.id, 'ReceivingOne');
  const foreignSender = await createSender(sendingAdmin.token, 'ReceivingForeign');
  const foreignReceiver = await createReceiver(sendingAdmin.token, foreignSender.id, 'ReceivingForeignOne');

  log('4. Recording a BANK-mode sub-payment against a CASH transaction');
  const partialTx = await createImmediateTransaction(
    sendingAdmin.token,
    sender.id,
    receiver.id,
    exchangeRate.id,
    accraPoint.id,
    'partial'
  );
  assertEqual(partialTx.status, 'SYNCED', 'Immediate transaction should be synced on creation');

  const subPaymentResult = await expectSuccess(
    'record bank-mode sub-payment',
    `/api/transactions/${partialTx.id}/sub-payments`,
    {
      token: teller.token,
      method: 'POST',
      body: {
        ghsAmount: 100,
        receiverName: `${receiver.firstName} ${receiver.lastName}`.trim(),
        receiverPhone: receiver.phone,
        notes: `bank-sub-payment-${runId}`,
        receivingMode: 'BANK',
        bankName: 'GCB Bank',
        bankAccountNo: `BANK-${runId}`,
        bankAccountName: 'Receiving Smoke Beneficiary',
      },
    }
  );

  assertEqual(subPaymentResult.subPayment.receivingMode, 'BANK', 'Sub-payment should persist teller-selected receiving mode');
  const partialTxDb = await prisma.transaction.findUnique({
    where: { id: partialTx.id },
    select: { status: true, receivingMode: true },
  });
  assertEqual(partialTxDb?.status, 'PARTIAL_PAYMENT', 'Sub-payment should move transaction to PARTIAL_PAYMENT');
  assertEqual(partialTxDb?.receivingMode, 'BANK', 'Transaction payout mode should update to BANK after bank sub-payment');
  const debitCode = await getLatestDisbursementDebitCode(partialTx.id);
  assertEqual(debitCode, 'BANK-DISBURSE-EXPENSE', 'Ledger should classify the sub-payment as a bank disbursement');

  log('5. Verifying deferred multi-receiver ownership guard');
  const deferredTx = await expectSuccess('create deferred multi-receiver transaction', '/api/transactions/multi-receiver', {
    token: sendingAdmin.token,
    method: 'POST',
    body: {
      senderId: sender.id,
      cadAmount: 60,
      exchangeRateId: exchangeRate.id,
      paymentMethod: 'CASH',
      amountPaidCAD: 60,
      receivingMode: 'CASH',
      receivingPointId: accraPoint.id,
      codeType: 'ADDITIONAL',
      receiversDeferred: true,
      notes: `smoke-receiving-deferred-${runId}`,
      cashPhoneNumber: buildPhone(`deferred${runId}`),
    },
  });

  const foreignAllocation = await expectFailure(
    'deferred disbursement foreign receiver',
    '/api/transactions/multi-receiver/disburse',
    {
      token: teller.token,
      method: 'POST',
      body: {
        transactionId: deferredTx.id,
        allocations: [
          {
            receiverId: foreignReceiver.id,
            receiverName: `${foreignReceiver.firstName} ${foreignReceiver.lastName}`.trim(),
            receiverPhone: foreignReceiver.phone,
            ghsAmount: Number(deferredTx.ghsAmount),
          },
        ],
      },
    },
    400
  );
  assert(
    (foreignAllocation.error || '').includes('original sender') ||
      (foreignAllocation.error || '').includes('must belong'),
    'Deferred multi-receiver disbursement should reject receivers from another sender'
  );

  log('6. Verifying receiving-side flagging and restore behavior');
  const voidBlocked = await expectFailure(
    'receiving void blocked',
    `/api/transactions/${partialTx.id}/flag`,
    {
      token: receivingAdmin.token,
      method: 'POST',
      body: { action: 'VOID', reason: 'Unsafe receiving-side void test' },
    },
    400
  );
  assert(
    (voidBlocked.error || '').includes('disabled') ||
      (voidBlocked.error || '').includes('bypass'),
    'Receiving-side void rejection should explain why voiding is blocked'
  );

  const heldTx = await expectSuccess(
    'flag partial-payment transaction',
    `/api/transactions/${partialTx.id}/flag`,
    {
      token: receivingAdmin.token,
      method: 'POST',
      body: { action: 'FLAGGED', reason: 'Receiver verification pending' },
    }
  );
  assertEqual(heldTx.status, 'FLAGGED', 'Flagging a partial-payment transaction should place it on hold');

  const restoredHeld = await expectSuccess(
    'restore held transaction',
    `/api/transactions/${partialTx.id}/flag`,
    {
      token: receivingAdmin.token,
      method: 'POST',
      body: { action: 'RESTORE', reason: 'Receiver verified' },
    }
  );
  assertEqual(restoredHeld.status, 'PARTIAL_PAYMENT', 'Restoring a held partial-payment transaction should return it to PARTIAL_PAYMENT');

  log('7. Verifying paid-transaction soft flagging');
  const paidTx = await createImmediateTransaction(
    sendingAdmin.token,
    sender.id,
    receiver.id,
    exchangeRate.id,
    accraPoint.id,
    'paid',
    'CASH',
    91
  );

  const markedPaid = await expectSuccess(
    'mark immediate transaction paid',
    `/api/transactions/${paidTx.id}/mark-paid`,
    {
      token: teller.token,
      method: 'POST',
      body: {
        receivingMode: 'CASH',
        cashPhoneNumber: buildPhone(`paid-cash${runId}`),
        cashGhanaCardNumber: `GHA-${runId}`,
      },
    }
  );
  assertEqual(markedPaid.status, 'PAID', 'Immediate transaction should be payable by the teller');

  const softFlagged = await expectSuccess(
    'flag paid transaction',
    `/api/transactions/${paidTx.id}/flag`,
    {
      token: receivingAdmin.token,
      method: 'POST',
      body: { action: 'FLAGGED', reason: 'Post-payment verification required' },
    }
  );
  assertEqual(softFlagged.status, 'PAID', 'Flagging a paid transaction should preserve PAID status');
  assert(softFlagged.flagReason, 'Flagging a paid transaction should record a reason');

  const restoredPaid = await expectSuccess(
    'restore paid transaction flag',
    `/api/transactions/${paidTx.id}/flag`,
    {
      token: receivingAdmin.token,
      method: 'POST',
      body: { action: 'RESTORE', reason: 'Issue resolved' },
    }
  );
  assertEqual(restoredPaid.status, 'PAID', 'Restoring a soft-flagged paid transaction should keep it PAID');
  assert(!restoredPaid.flagReason, 'Restoring a soft-flagged paid transaction should clear the flag reason');

  log('8. Verifying reconciliation resubmission and stale approval guard');
  const resubmissionDate = '2099-01-02';
  const firstRecon = await expectSuccess(
    'submit reconciliation first pass',
    '/api/reconciliation',
    {
      token: teller.token,
      method: 'POST',
      body: {
        reconciliationDate: `${resubmissionDate}T12:34:56.000Z`,
        actualClosing: 0,
        notes: `recon-first-${runId}`,
      },
    }
  );

  const secondRecon = await expectSuccess(
    'submit reconciliation second pass',
    '/api/reconciliation',
    {
      token: teller.token,
      method: 'POST',
      body: {
        reconciliationDate: resubmissionDate,
        actualClosing: 1,
        notes: `recon-second-${runId}`,
      },
    }
  );

  assertEqual(secondRecon.id, firstRecon.id, 'Resubmission should update the existing same-day reconciliation instead of creating a duplicate');
  const updatedRecon = await prisma.tellerReconciliation.findUnique({
    where: { id: firstRecon.id },
    select: { notes: true },
  });
  assertEqual(updatedRecon?.notes, `recon-second-${runId}`, 'Resubmission should replace the reconciliation notes with the latest submission');

  const staleDate = '2099-01-03';
  const staleBusinessDate = new Date(`${staleDate}T00:00:00.000Z`);
  const staleOlder = await prisma.tellerReconciliation.create({
    data: {
      tellerId: teller.user.id,
      receivingPointId: accraPoint.id,
      reconciliationDate: staleBusinessDate,
      openingBalance: 0,
      vaultTransfersIn: 0,
      paymentsMade: 0,
      returnsToVault: 0,
      expectedClosing: 0,
      actualClosing: 0,
      variance: 0,
      status: 'PENDING',
      notes: `legacy-older-${runId}`,
    },
  });

  await sleep(25);

  const staleNewer = await prisma.tellerReconciliation.create({
    data: {
      tellerId: teller.user.id,
      receivingPointId: accraPoint.id,
      reconciliationDate: staleBusinessDate,
      openingBalance: 0,
      vaultTransfersIn: 0,
      paymentsMade: 0,
      returnsToVault: 0,
      expectedClosing: 0,
      actualClosing: 0,
      variance: 0,
      status: 'PENDING',
      notes: `legacy-newer-${runId}`,
    },
  });

  const staleApprove = await expectFailure(
    'approve stale reconciliation',
    `/api/reconciliation/${staleOlder.id}/approve`,
    {
      token: receivingAdmin.token,
      method: 'POST',
    },
    409
  );
  assert(
    (staleApprove.error || '').includes('newer reconciliation submission'),
    'Approving a stale reconciliation should be blocked when a newer submission exists'
  );

  const approvedLatest = await expectSuccess(
    'approve latest reconciliation',
    `/api/reconciliation/${staleNewer.id}/approve`,
    {
      token: receivingAdmin.token,
      method: 'POST',
    }
  );
  assertEqual(approvedLatest.status, 'APPROVED', 'Latest reconciliation should still be approvable');

  log('');
  log('Receiving portal smoke test passed.');
  log(`Partial-payment hold transaction: ${partialTx.transactionCode}`);
  log(`Paid soft-flag transaction: ${paidTx.transactionCode}`);
  log(`Deferred multi-receiver transaction: ${deferredTx.transactionCode}`);
}

try {
  await main();
} catch (error) {
  console.error('\nReceiving portal smoke test failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
