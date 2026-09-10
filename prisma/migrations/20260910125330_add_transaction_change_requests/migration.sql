-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('DISBURSEMENT_REVERSAL', 'TRANSACTION_EDIT', 'TRANSACTION_CANCEL');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TransactionChangeRequest" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedChanges" JSONB,
    "snapshot" JSONB,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "receivingPointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionChangeRequest_status_idx" ON "TransactionChangeRequest"("status");

-- CreateIndex
CREATE INDEX "TransactionChangeRequest_transactionId_idx" ON "TransactionChangeRequest"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionChangeRequest_receivingPointId_status_idx" ON "TransactionChangeRequest"("receivingPointId", "status");

-- CreateIndex
CREATE INDEX "TransactionChangeRequest_requestedById_idx" ON "TransactionChangeRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "TransactionChangeRequest" ADD CONSTRAINT "TransactionChangeRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionChangeRequest" ADD CONSTRAINT "TransactionChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionChangeRequest" ADD CONSTRAINT "TransactionChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

