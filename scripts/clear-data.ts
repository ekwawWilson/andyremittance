/**
 * Clears all data except User records.
 * Deletes in foreign-key dependency order to avoid constraint violations.
 *
 * Usage:
 *   npx tsx scripts/clear-data.ts
 *
 * You will be prompted to confirm before anything is deleted.
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function main() {
  console.log('\n⚠️  This will permanently delete ALL data except User accounts.\n');

  const ok = await confirm('Type "yes" to continue: ');
  if (!ok) {
    console.log('Aborted.\n');
    return;
  }

  console.log('\nClearing data...\n');

  // Leaf tables first, then parents
  const steps: Array<{ label: string; fn: () => Promise<{ count: number }> }> = [
    { label: 'Notifications',           fn: () => prisma.notification.deleteMany() },
    { label: 'JournalLines',            fn: () => prisma.journalLine.deleteMany() },
    { label: 'JournalEntries',          fn: () => prisma.journalEntry.deleteMany() },
    { label: 'AccountingPeriods',       fn: () => prisma.accountingPeriod.deleteMany() },
    { label: 'SubPayments',             fn: () => prisma.subPayment.deleteMany() },
    { label: 'TransactionReceivers',    fn: () => prisma.transactionReceiver.deleteMany() },
    { label: 'LedgerEntries',           fn: () => prisma.ledgerEntry.deleteMany() },
    { label: 'AuditLogs',               fn: () => prisma.auditLog.deleteMany() },
    { label: 'TellerReconciliations',   fn: () => prisma.tellerReconciliation.deleteMany() },
    { label: 'CashTransferRequests',    fn: () => prisma.cashTransferRequest.deleteMany() },
    { label: 'ReceivingEodRecords',     fn: () => prisma.receivingEodRecord.deleteMany() },
    { label: 'Transactions',            fn: () => prisma.transaction.deleteMany() },
    { label: 'EndOfDayRecords',         fn: () => prisma.endOfDayRecord.deleteMany() },
    { label: 'LedgerAccounts',          fn: () => prisma.ledgerAccount.deleteMany() },
    { label: 'Receivers',               fn: () => prisma.receiver.deleteMany() },
    { label: 'Senders',                 fn: () => prisma.sender.deleteMany() },
    { label: 'ExchangeRates',           fn: () => prisma.exchangeRate.deleteMany() },
    { label: 'Permissions',             fn: () => prisma.permission.deleteMany() },
    { label: 'Roles',                   fn: () => prisma.role.deleteMany() },
    { label: 'ReceivingPoints',         fn: () => prisma.receivingPoint.deleteMany() },
  ];

  for (const step of steps) {
    const result = await step.fn();
    console.log(`  ✓ ${step.label.padEnd(26)} ${result.count} row(s) deleted`);
  }

  const userCount = await prisma.user.count();
  console.log(`\n  Users preserved: ${userCount}\n`);
  console.log('Done.\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
