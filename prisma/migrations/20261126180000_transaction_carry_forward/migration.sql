-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "carriedForwardAt" TIMESTAMP(3),
ADD COLUMN     "carriedForwardToId" TEXT,
ADD COLUMN     "carriedInGHS" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "carriedOutGHS" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Transaction_carriedForwardToId_idx" ON "Transaction"("carriedForwardToId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_carriedForwardToId_fkey" FOREIGN KEY ("carriedForwardToId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
