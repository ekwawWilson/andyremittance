/**
 * clear-data.ts
 * Deletes all operational data while preserving Users, Permissions, and Roles.
 * Run with: npx tsx prisma/clear-data.ts
 */
import prisma from '../lib/db/prisma';

async function main() {
  console.log('Clearing operational data...');

  // Delete in dependency order (children before parents)
  const results = await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.subPayment.deleteMany(),
    prisma.tellerReconciliation.deleteMany(),
    prisma.receivingEodRecord.deleteMany(),
    prisma.endOfDayRecord.deleteMany(),
    prisma.cashTransferRequest.deleteMany(),
    prisma.ledgerEntry.deleteMany(),
    prisma.transactionReceiver.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.ledgerAccount.deleteMany(),
    prisma.receiver.deleteMany(),
    prisma.sender.deleteMany(),
    prisma.exchangeRate.deleteMany(),
    prisma.receivingPoint.deleteMany(),
  ]);

  const labels = [
    'Notifications',
    'SubPayments',
    'TellerReconciliations',
    'ReceivingEodRecords',
    'EndOfDayRecords',
    'CashTransferRequests',
    'LedgerEntries',
    'TransactionReceivers',
    'AuditLogs',
    'Transactions',
    'LedgerAccounts',
    'Receivers',
    'Senders',
    'ExchangeRates',
    'ReceivingPoints',
  ];

  results.forEach((r, i) => console.log(`  ${labels[i]}: ${r.count} deleted`));
  console.log('\nDone. Users, Permissions, and Roles are untouched.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
