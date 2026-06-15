/**
 * One-shot script: delete every Transaction (and all dependent rows) except
 * the one with transactionCode = 'ADDITIONAL-A1506-M979'.
 *
 * Deletion order respects FK constraints:
 *   SubPayment           → references Transaction
 *   TransactionReceiver  → references Transaction
 *   LedgerEntry          → references Transaction (nullable FK)
 *   Notification         → references Transaction
 *   AuditLog (entity=Transaction) → no FK, safe to delete by entityId
 *   EndOfDayRecord       → transactions reference it; clear the FK first
 *   Transaction          → deleted last
 *
 * Also clears orphaned EOD records, reconciliations, and journal entries
 * that have no remaining transaction so the UI is clean.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';

// Load .env into process.env
readFileSync('.env', 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const KEEP_CODE = 'ADDITIONAL-A1506-M979';

async function run() {
  // 1. Find the transaction to keep
  const keep = await p.transaction.findFirst({
    where: { transactionCode: KEEP_CODE },
    select: { id: true, transactionCode: true, endOfDayRecordId: true },
  });

  if (!keep) {
    console.error(`Transaction ${KEEP_CODE} not found — aborting.`);
    await p.$disconnect();
    process.exit(1);
  }

  console.log(`Keeping: ${keep.transactionCode} (${keep.id})`);

  const KEEP_ID = keep.id;

  // 2. Collect IDs to delete
  const toDelete = await p.transaction.findMany({
    where: { id: { not: KEEP_ID } },
    select: { id: true },
  });
  const deleteIds = toDelete.map((t) => t.id);
  console.log(`Transactions to delete: ${deleteIds.length}`);

  if (deleteIds.length === 0) {
    console.log('Nothing to delete.');
    await p.$disconnect();
    return;
  }

  // 3. Delete dependent rows in FK order
  const [sp, tr, le, notif] = await Promise.all([
    p.subPayment.deleteMany({ where: { transactionId: { in: deleteIds } } }),
    p.transactionReceiver.deleteMany({ where: { transactionId: { in: deleteIds } } }),
    p.ledgerEntry.deleteMany({ where: { transactionId: { in: deleteIds } } }),
    p.notification.deleteMany({ where: { transactionId: { in: deleteIds } } }),
  ]);
  console.log(`  SubPayments deleted:          ${sp.count}`);
  console.log(`  TransactionReceivers deleted: ${tr.count}`);
  console.log(`  LedgerEntries deleted:        ${le.count}`);
  console.log(`  Notifications deleted:        ${notif.count}`);

  // 4. Audit log rows that reference deleted transactions
  const al = await p.auditLog.deleteMany({
    where: { entity: 'Transaction', entityId: { in: deleteIds } },
  });
  console.log(`  AuditLog (tx) rows deleted:   ${al.count}`);

  // 5. Clear endOfDayRecordId FK on the deleted transactions before deleting EODs
  //    (the keep transaction may reference an EOD — leave its FK alone)
  await p.transaction.updateMany({
    where: { id: { in: deleteIds } },
    data: { endOfDayRecordId: null },
  });

  // 6. Delete the transactions
  const tx = await p.transaction.deleteMany({ where: { id: { in: deleteIds } } });
  console.log(`  Transactions deleted:         ${tx.count}`);

  // 7. Delete EOD records that are now empty (no transactions reference them),
  //    except any EOD still referenced by the kept transaction.
  const keepEodId = keep.endOfDayRecordId;
  const orphanEods = await p.endOfDayRecord.findMany({
    where: {
      transactions: { none: {} },
      ...(keepEodId ? { id: { not: keepEodId } } : {}),
    },
    select: { id: true },
  });
  if (orphanEods.length > 0) {
    const eod = await p.endOfDayRecord.deleteMany({
      where: { id: { in: orphanEods.map((e) => e.id) } },
    });
    console.log(`  EndOfDayRecords deleted:      ${eod.count}`);
  }

  // 8. Delete journal entries whose transactionId is in the deleted set
  //    Must delete JournalLines first (FK constraint).
  const jeIds = (await p.journalEntry.findMany({
    where: { transactionId: { in: deleteIds } },
    select: { id: true },
  })).map((j) => j.id);

  if (jeIds.length > 0) {
    const jl = await p.journalLine.deleteMany({ where: { journalEntryId: { in: jeIds } } });
    console.log(`  JournalLines deleted:         ${jl.count}`);
    const je = await p.journalEntry.deleteMany({ where: { id: { in: jeIds } } });
    console.log(`  JournalEntries deleted:       ${je.count}`);
  }

  // 9. Final count
  const remaining = await p.transaction.count();
  console.log(`\nDone. Transactions remaining: ${remaining}`);
}

run()
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
