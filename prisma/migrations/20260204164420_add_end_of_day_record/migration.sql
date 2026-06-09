-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "endOfDayRecordId" TEXT;

-- CreateTable
CREATE TABLE "EndOfDayRecord" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EndOfDayRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EndOfDayRecord_closedById_idx" ON "EndOfDayRecord"("closedById");

-- CreateIndex
CREATE INDEX "EndOfDayRecord_date_idx" ON "EndOfDayRecord"("date");

-- CreateIndex
CREATE INDEX "EndOfDayRecord_closedAt_idx" ON "EndOfDayRecord"("closedAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_endOfDayRecordId_fkey" FOREIGN KEY ("endOfDayRecordId") REFERENCES "EndOfDayRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndOfDayRecord" ADD CONSTRAINT "EndOfDayRecord_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
