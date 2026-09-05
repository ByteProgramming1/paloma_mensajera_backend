-- AlterTable
ALTER TABLE "users" ADD COLUMN     "roleAssignedAt" TIMESTAMP(3),
ADD COLUMN     "roleAssignedByAdminId" TEXT;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'MESSAGE_PENDING_REVIEW',
ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "unitPrice" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "message_reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "automaticFilterMethod" TEXT NOT NULL,
    "automaticFilterPassed" BOOLEAN NOT NULL DEFAULT true,
    "humanReviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "message_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_reviews_orderId_key" ON "message_reviews"("orderId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleAssignedByAdminId_fkey" FOREIGN KEY ("roleAssignedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reviews" ADD CONSTRAINT "message_reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reviews" ADD CONSTRAINT "message_reviews_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

