-- AlterTable
ALTER TABLE "products" ADD COLUMN "imageUrl" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_message_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "automaticFilterMethod" TEXT,
    "automaticFilterPassed" BOOLEAN,
    "humanReviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "rejectionReason" TEXT,
    CONSTRAINT "message_reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_reviews_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_message_reviews" ("automaticFilterMethod", "automaticFilterPassed", "humanReviewStatus", "id", "orderId", "rejectionReason", "reviewedAt", "reviewedByUserId") SELECT "automaticFilterMethod", "automaticFilterPassed", "humanReviewStatus", "id", "orderId", "rejectionReason", "reviewedAt", "reviewedByUserId" FROM "message_reviews";
DROP TABLE "message_reviews";
ALTER TABLE "new_message_reviews" RENAME TO "message_reviews";
CREATE UNIQUE INDEX "message_reviews_orderId_key" ON "message_reviews"("orderId");
CREATE TABLE "new_delivery_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "buyerFullName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerType" TEXT NOT NULL,
    "buyerCareerOrArea" TEXT NOT NULL,
    "selfPickup" BOOLEAN NOT NULL DEFAULT false,
    "recipientFullName" TEXT NOT NULL,
    "recipientCareerOrArea" TEXT,
    "recipientTeamsUser" TEXT NOT NULL,
    "deliveryNotes" TEXT,
    "letterContent" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "contentModerationMethod" TEXT,
    "teamsNotificationSent" BOOLEAN NOT NULL DEFAULT false,
    "teamsGraphMessageId" TEXT,
    CONSTRAINT "delivery_details_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_delivery_details" ("buyerEmail", "buyerPhone", "contentModerationMethod", "id", "isAnonymous", "letterContent", "orderId", "recipientTeamsUser", "teamsGraphMessageId", "teamsNotificationSent") SELECT "buyerEmail", "buyerPhone", "contentModerationMethod", "id", "isAnonymous", "letterContent", "orderId", "recipientTeamsUser", "teamsGraphMessageId", "teamsNotificationSent" FROM "delivery_details";
DROP TABLE "delivery_details";
ALTER TABLE "new_delivery_details" RENAME TO "delivery_details";
CREATE UNIQUE INDEX "delivery_details_orderId_key" ON "delivery_details"("orderId");
CREATE TABLE "new_payment_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'NEQUI',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByAdminId" TEXT,
    "verifiedAt" DATETIME,
    "verificationNotes" TEXT,
    CONSTRAINT "payment_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payment_transactions_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_payment_transactions" ("id", "orderId", "paymentMethod", "verificationNotes", "verified", "verifiedAt") SELECT "id", "orderId", "paymentMethod", "verificationNotes", "verified", "verifiedAt" FROM "payment_transactions";
DROP TABLE "payment_transactions";
ALTER TABLE "new_payment_transactions" RENAME TO "payment_transactions";
CREATE UNIQUE INDEX "payment_transactions_orderId_key" ON "payment_transactions"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

