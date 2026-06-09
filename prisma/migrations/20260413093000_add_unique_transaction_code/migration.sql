-- Enforce unique customer-facing transaction codes.
CREATE UNIQUE INDEX "Transaction_transactionCode_key" ON "Transaction"("transactionCode");
