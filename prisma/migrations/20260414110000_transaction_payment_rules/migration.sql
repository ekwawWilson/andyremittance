ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'PARTIAL_PAYMENT';

ALTER TYPE "LedgerAccountType" ADD VALUE IF NOT EXISTS 'ADDITIONAL_TILL';

ALTER TABLE "Transaction"
ADD COLUMN "bankAccountName" TEXT,
ADD COLUMN "cashPhoneNumber" TEXT,
ADD COLUMN "cashGhanaCardNumber" TEXT;

ALTER TABLE "SubPayment"
ADD COLUMN "receiverName" TEXT,
ADD COLUMN "receiverPhone" TEXT,
ADD COLUMN "receivingMode" "ReceivingMode",
ADD COLUMN "bankName" TEXT,
ADD COLUMN "bankAccountNo" TEXT,
ADD COLUMN "bankAccountName" TEXT,
ADD COLUMN "cashPhoneNumber" TEXT,
ADD COLUMN "cashGhanaCardNumber" TEXT,
ADD COLUMN "momoNumber" TEXT,
ADD COLUMN "momoName" TEXT,
ADD COLUMN "remainingBalance" DECIMAL(10,2);
