-- CreateIndex
CREATE INDEX "Transaction_transactionDate_status_idx" ON "Transaction"("transactionDate", "status");

-- CreateIndex
CREATE INDEX "Transaction_createdById_transactionDate_idx" ON "Transaction"("createdById", "transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_receivingPointId_status_idx" ON "Transaction"("receivingPointId", "status");

-- CreateIndex
CREATE INDEX "Transaction_syncedToReceiving_status_idx" ON "Transaction"("syncedToReceiving", "status");
