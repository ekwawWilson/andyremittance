-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionReceiver" DROP CONSTRAINT "TransactionReceiver_receiverId_fkey";

-- DropIndex
DROP INDEX "Notification_receivingPointId_isRead_idx";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "receiversDeferred" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "receiverId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TransactionReceiver" ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidByName" TEXT,
ADD COLUMN     "receiverName" TEXT,
ADD COLUMN     "receiverPhone" TEXT,
ALTER COLUMN "receiverId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Notification_receivingPointId_isRead_createdAt_idx" ON "Notification"("receivingPointId", "isRead", "createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Receiver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionReceiver" ADD CONSTRAINT "TransactionReceiver_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Receiver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
