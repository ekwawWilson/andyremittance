-- CreateTable
CREATE TABLE "TransactionReceiver" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "ghsAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionReceiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionReceiver_transactionId_idx" ON "TransactionReceiver"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionReceiver_receiverId_idx" ON "TransactionReceiver"("receiverId");

-- AddForeignKey
ALTER TABLE "TransactionReceiver" ADD CONSTRAINT "TransactionReceiver_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionReceiver" ADD CONSTRAINT "TransactionReceiver_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Receiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
