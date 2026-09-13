-- AlterTable
ALTER TABLE "addon_options" ADD COLUMN "linkedProductId" TEXT;

-- AddForeignKey
ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_linkedProductId_fkey" FOREIGN KEY ("linkedProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
