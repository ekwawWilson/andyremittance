-- CreateTable
CREATE TABLE "SubPayment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "ghsAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "paidById" TEXT NOT NULL,
    "paidByName" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivingPointId" TEXT,

    CONSTRAINT "SubPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubPayment_transactionId_idx" ON "SubPayment"("transactionId");

-- CreateIndex
CREATE INDEX "SubPayment_receivingPointId_idx" ON "SubPayment"("receivingPointId");

-- CreateIndex
CREATE INDEX "SubPayment_paidAt_idx" ON "SubPayment"("paidAt");

-- AddForeignKey
ALTER TABLE "SubPayment" ADD CONSTRAINT "SubPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
