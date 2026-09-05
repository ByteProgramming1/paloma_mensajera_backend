-- DropForeignKey
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_verifiedByUserId_fkey";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "message_reviews" ALTER COLUMN "automaticFilterMethod" DROP NOT NULL,
ALTER COLUMN "automaticFilterPassed" DROP NOT NULL,
ALTER COLUMN "automaticFilterPassed" DROP DEFAULT;

-- AlterTable
ALTER TABLE "delivery_details" DROP COLUMN "buyerName",
DROP COLUMN "recipientName",
ADD COLUMN     "buyerCareerOrArea" TEXT NOT NULL,
ADD COLUMN     "buyerFullName" TEXT NOT NULL,
ADD COLUMN     "buyerType" TEXT NOT NULL,
ADD COLUMN     "deliveryNotes" TEXT,
ADD COLUMN     "recipientCareerOrArea" TEXT,
ADD COLUMN     "recipientFullName" TEXT NOT NULL,
ADD COLUMN     "selfPickup" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "contentModerationMethod" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payment_transactions" DROP COLUMN "verifiedByUserId",
ADD COLUMN     "verifiedByAdminId" TEXT;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

