-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "receivingPointId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_receivingPointId_isRead_idx" ON "Notification"("receivingPointId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_transactionId_idx" ON "Notification"("transactionId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_receivingPointId_fkey" FOREIGN KEY ("receivingPointId") REFERENCES "ReceivingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
