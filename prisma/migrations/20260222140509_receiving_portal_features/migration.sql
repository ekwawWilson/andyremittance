-- CreateEnum
CREATE TYPE "TransferRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'RECEIVING_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'SENDING_ADMIN';

-- CreateTable
CREATE TABLE "CashTransferRequest" (
    "id" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TransferRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "receivingPointId" TEXT,

    CONSTRAINT "CashTransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivingEodRecord" (
    "id" TEXT NOT NULL,
    "receivingPointId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalDisbursed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "disbursementCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "ReceivingEodRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashTransferRequest_status_idx" ON "CashTransferRequest"("status");

-- CreateIndex
CREATE INDEX "CashTransferRequest_requestedById_idx" ON "CashTransferRequest"("requestedById");

-- CreateIndex
CREATE INDEX "CashTransferRequest_receivingPointId_idx" ON "CashTransferRequest"("receivingPointId");

-- CreateIndex
CREATE INDEX "ReceivingEodRecord_receivingPointId_idx" ON "ReceivingEodRecord"("receivingPointId");

-- CreateIndex
CREATE INDEX "ReceivingEodRecord_date_idx" ON "ReceivingEodRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivingEodRecord_receivingPointId_date_key" ON "ReceivingEodRecord"("receivingPointId", "date");

-- AddForeignKey
ALTER TABLE "CashTransferRequest" ADD CONSTRAINT "CashTransferRequest_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransferRequest" ADD CONSTRAINT "CashTransferRequest_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransferRequest" ADD CONSTRAINT "CashTransferRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivingEodRecord" ADD CONSTRAINT "ReceivingEodRecord_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivingEodRecord" ADD CONSTRAINT "ReceivingEodRecord_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
