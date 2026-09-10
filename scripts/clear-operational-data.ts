/**
 * clear-operational-data.ts
 *
 * Wipes every operational record while keeping the things people log in with
 * and the accounts the system needs to function:
 *
 *   KEPT    User · Role · Permission · ReceivingPoint · SystemConfig
 *           LedgerAccount (the chart of accounts) — balances reset to zero
 *   DELETED transactions, senders, receivers, journals, ledger entries,
 *           reconciliations, EOD records, transfers, rates, notifications,
 *           audit log, and per-sender ledger accounts
 *
 * SystemConfig is kept deliberately: it is the sending portal's business-date
 * singleton, and without it the dashboard's "today" panel and the EOD flow have
 * no date to work from.
 *
 * Receiving points are kept deliberately: users carry a receivingPointId, so
 * dropping branches would orphan every teller and manager.
 *
 * The chart of accounts is kept because imports and disbursements resolve
 * CASH-CAD, INCOME-STANDARD and EQUITY-RETAINED-GHS by code — delete them and
 * the app throws "Account not found" until the seed is re-run.
 *
 * Usage:
 *   npx tsx scripts/clear-operational-data.ts --dry-run   (default: shows counts)
 *   npx tsx scripts/clear-operational-data.ts --confirm    (actually deletes)
 */

import prisma from '../lib/db/prisma';

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  if (!CONFIRM) {
    console.log('DRY RUN — nothing will be deleted. Pass --confirm to apply.\n');
  }

  // ── What is here right now ────────────────────────────────────────────────
  const before = {
    users:          await prisma.user.count(),
    roles:          await prisma.role.count(),
    receivingPoints:await prisma.receivingPoint.count(),
    ledgerAccounts: await prisma.ledgerAccount.count(),
    senderAccounts: await prisma.ledgerAccount.count({ where: { accountType: 'SENDER' } }),
    transactions:   await prisma.transaction.count(),
    journals:       await prisma.journalEntry.count(),
    auditLogs:      await prisma.auditLog.count(),
  };
  console.log('Before:', JSON.stringify(before, null, 2));

  if (!CONFIRM) {
    console.log('\nWould keep : users, roles, permissions, receiving points,');
    console.log(`             ${before.ledgerAccounts - before.senderAccounts} chart-of-accounts rows (balances zeroed)`);
    console.log(`Would delete: all operational rows + ${before.senderAccounts} per-sender ledger accounts`);
    await prisma.$disconnect();
    return;
  }

  // ── Delete children before parents ────────────────────────────────────────
  // Sequential rather than one $transaction: the pooled connection times out on
  // a long interactive transaction, and each step is independently safe.
  const steps: Array<[string, () => Promise<{ count: number }>]> = [
    ['JournalLine',          () => prisma.journalLine.deleteMany()],
    ['JournalEntry',         () => prisma.journalEntry.deleteMany()],
    ['Notification',         () => prisma.notification.deleteMany()],
    ['SubPayment',           () => prisma.subPayment.deleteMany()],
    ['TransactionReceiver',  () => prisma.transactionReceiver.deleteMany()],
    ['LedgerEntry',          () => prisma.ledgerEntry.deleteMany()],
    ['CashTransferRequest',  () => prisma.cashTransferRequest.deleteMany()],
    ['TellerReconciliation', () => prisma.tellerReconciliation.deleteMany()],
    ['ReceivingEodRecord',   () => prisma.receivingEodRecord.deleteMany()],
    ['Transaction',          () => prisma.transaction.deleteMany()],
    ['EndOfDayRecord',       () => prisma.endOfDayRecord.deleteMany()],
    ['Receiver',             () => prisma.receiver.deleteMany()],
    ['Sender',               () => prisma.sender.deleteMany()],
    ['ExchangeRate',         () => prisma.exchangeRate.deleteMany()],
    ['AccountingPeriod',     () => prisma.accountingPeriod.deleteMany()],
    ['AuditLog',             () => prisma.auditLog.deleteMany()],
    // Per-sender ledger accounts belong to senders that no longer exist.
    ['LedgerAccount(SENDER)',() => prisma.ledgerAccount.deleteMany({ where: { accountType: 'SENDER' } })],
  ];

  console.log('\nDeleting:');
  for (const [label, run] of steps) {
    const { count } = await run();
    console.log(`  ${label.padEnd(24)} ${count}`);
  }

  // Surviving accounts start from a clean slate.
  const zeroed = await prisma.ledgerAccount.updateMany({ data: { balance: 0 } });
  console.log(`\n  balances zeroed on ${zeroed.count} remaining ledger accounts`);

  const after = {
    users:          await prisma.user.count(),
    roles:          await prisma.role.count(),
    receivingPoints:await prisma.receivingPoint.count(),
    ledgerAccounts: await prisma.ledgerAccount.count(),
    transactions:   await prisma.transaction.count(),
    journals:       await prisma.journalEntry.count(),
    auditLogs:      await prisma.auditLog.count(),
  };
  console.log('\nAfter:', JSON.stringify(after, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
