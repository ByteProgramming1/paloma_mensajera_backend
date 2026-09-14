-- AlterTable
ALTER TABLE "orders" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "orders_groupId_idx" ON "orders"("groupId");
