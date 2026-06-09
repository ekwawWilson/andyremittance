-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('REMITTANCE_RECEIPT', 'SYNC_ALLOCATION', 'DISBURSEMENT', 'VAULT_TRANSFER', 'TELLER_RECONCILIATION', 'EXCHANGE_ADJUSTMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerAccountType" ADD VALUE 'INCOME';
ALTER TYPE "LedgerAccountType" ADD VALUE 'EXPENSE';
ALTER TYPE "LedgerAccountType" ADD VALUE 'EQUITY';
ALTER TYPE "LedgerAccountType" ADD VALUE 'LIABILITY';

-- AlterTable
ALTER TABLE "LedgerAccount" ADD COLUMN     "accountGroup" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "journalDate" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entryType" "JournalEntryType" NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "receivingPointId" TEXT,
    "transactionId" TEXT,
    "reconciliationId" TEXT,
    "transferRequestId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalOfId" TEXT,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "description" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "receivingPointId" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_journalDate_idx" ON "JournalEntry"("journalDate");

-- CreateIndex
CREATE INDEX "JournalEntry_receivingPointId_journalDate_idx" ON "JournalEntry"("receivingPointId", "journalDate");

-- CreateIndex
CREATE INDEX "JournalEntry_entryType_idx" ON "JournalEntry"("entryType");

-- CreateIndex
CREATE INDEX "JournalEntry_transactionId_idx" ON "JournalEntry"("transactionId");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "AccountingPeriod_status_idx" ON "AccountingPeriod"("status");

-- CreateIndex
CREATE INDEX "AccountingPeriod_receivingPointId_idx" ON "AccountingPeriod"("receivingPointId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_periodYear_periodMonth_receivingPointId_key" ON "AccountingPeriod"("periodYear", "periodMonth", "receivingPointId");

-- CreateIndex
CREATE INDEX "LedgerAccount_accountGroup_idx" ON "LedgerAccount"("accountGroup");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
