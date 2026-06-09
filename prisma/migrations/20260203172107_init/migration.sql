-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TELLER', 'SENDING_AGENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SYNCED', 'PAID', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'E_TRANSFER', 'SPLIT');

-- CreateEnum
CREATE TYPE "ReceivingMode" AS ENUM ('CASH', 'BANK', 'MOMO');

-- CreateEnum
CREATE TYPE "TransactionCodeType" AS ENUM ('STANDARD', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('SENDER', 'COMPANY_CASH', 'COMPANY_VAULT', 'TELLER_TILL', 'BANK_CLEARING', 'MOMO_CLEARING', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "receivingPointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivingPoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sender" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Canada',
    "idType" TEXT,
    "idNumber" TEXT,
    "creditLimit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receiver" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "idType" TEXT,
    "idNumber" TEXT,
    "preferredMethod" TEXT NOT NULL DEFAULT 'CASH',
    "bankName" TEXT,
    "bankAccount" TEXT,
    "momoNumber" TEXT,
    "momoProvider" TEXT,
    "senderId" TEXT NOT NULL,
    "relationshipToSender" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cadToGhs" DECIMAL(10,4) NOT NULL,
    "setBy" TEXT NOT NULL,
    "setByName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "codeType" "TransactionCodeType" NOT NULL DEFAULT 'STANDARD',
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "cadAmount" DECIMAL(10,2) NOT NULL,
    "ghsAmount" DECIMAL(10,2) NOT NULL,
    "exchangeRateId" TEXT NOT NULL,
    "exchangeRateUsed" DECIMAL(10,4) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amountPaidCAD" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPendingCAD" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "receivingMode" "ReceivingMode" NOT NULL,
    "receivingPointId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "paidByName" TEXT,
    "createdById" TEXT NOT NULL,
    "transactionDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedToReceiving" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "accountType" "LedgerAccountType" NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "userId" TEXT,
    "senderId" TEXT,
    "receivingPointId" TEXT,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "transactionId" TEXT,
    "description" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TellerReconciliation" (
    "id" TEXT NOT NULL,
    "tellerId" TEXT NOT NULL,
    "receivingPointId" TEXT NOT NULL,
    "reconciliationDate" DATE NOT NULL,
    "openingBalance" DECIMAL(12,2) NOT NULL,
    "vaultTransfersIn" DECIMAL(12,2) NOT NULL,
    "paymentsMade" DECIMAL(12,2) NOT NULL,
    "returnsToVault" DECIMAL(12,2) NOT NULL,
    "expectedClosing" DECIMAL(12,2) NOT NULL,
    "actualClosing" DECIMAL(12,2) NOT NULL,
    "variance" DECIMAL(12,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TellerReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userRole" "UserRole",
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_receivingPointId_idx" ON "User"("receivingPointId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivingPoint_code_key" ON "ReceivingPoint"("code");

-- CreateIndex
CREATE INDEX "ReceivingPoint_code_idx" ON "ReceivingPoint"("code");

-- CreateIndex
CREATE INDEX "ReceivingPoint_isActive_idx" ON "ReceivingPoint"("isActive");

-- CreateIndex
CREATE INDEX "Sender_phone_idx" ON "Sender"("phone");

-- CreateIndex
CREATE INDEX "Sender_email_idx" ON "Sender"("email");

-- CreateIndex
CREATE INDEX "Sender_createdById_idx" ON "Sender"("createdById");

-- CreateIndex
CREATE INDEX "Receiver_senderId_idx" ON "Receiver"("senderId");

-- CreateIndex
CREATE INDEX "Receiver_phone_idx" ON "Receiver"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_key" ON "ExchangeRate"("date");

-- CreateIndex
CREATE INDEX "ExchangeRate_date_idx" ON "ExchangeRate"("date");

-- CreateIndex
CREATE INDEX "Transaction_transactionCode_idx" ON "Transaction"("transactionCode");

-- CreateIndex
CREATE INDEX "Transaction_senderId_idx" ON "Transaction"("senderId");

-- CreateIndex
CREATE INDEX "Transaction_receiverId_idx" ON "Transaction"("receiverId");

-- CreateIndex
CREATE INDEX "Transaction_receivingPointId_idx" ON "Transaction"("receivingPointId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_accountCode_key" ON "LedgerAccount"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_senderId_key" ON "LedgerAccount"("senderId");

-- CreateIndex
CREATE INDEX "LedgerAccount_accountType_idx" ON "LedgerAccount"("accountType");

-- CreateIndex
CREATE INDEX "LedgerAccount_accountCode_idx" ON "LedgerAccount"("accountCode");

-- CreateIndex
CREATE INDEX "LedgerAccount_userId_idx" ON "LedgerAccount"("userId");

-- CreateIndex
CREATE INDEX "LedgerAccount_senderId_idx" ON "LedgerAccount"("senderId");

-- CreateIndex
CREATE INDEX "LedgerAccount_receivingPointId_idx" ON "LedgerAccount"("receivingPointId");

-- CreateIndex
CREATE INDEX "LedgerEntry_debitAccountId_idx" ON "LedgerEntry"("debitAccountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_creditAccountId_idx" ON "LedgerEntry"("creditAccountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_entryDate_idx" ON "LedgerEntry"("entryDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_createdAt_idx" ON "LedgerEntry"("createdAt");

-- CreateIndex
CREATE INDEX "TellerReconciliation_tellerId_idx" ON "TellerReconciliation"("tellerId");

-- CreateIndex
CREATE INDEX "TellerReconciliation_receivingPointId_idx" ON "TellerReconciliation"("receivingPointId");

-- CreateIndex
CREATE INDEX "TellerReconciliation_reconciliationDate_idx" ON "TellerReconciliation"("reconciliationDate");

-- CreateIndex
CREATE INDEX "TellerReconciliation_status_idx" ON "TellerReconciliation"("status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sender" ADD CONSTRAINT "Sender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receiver" ADD CONSTRAINT "Receiver_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Receiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TellerReconciliation" ADD CONSTRAINT "TellerReconciliation_tellerId_fkey" FOREIGN KEY ("tellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TellerReconciliation" ADD CONSTRAINT "TellerReconciliation_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
