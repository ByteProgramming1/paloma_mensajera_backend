-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "selectedAddOnOptionId" TEXT;

-- CreateTable
CREATE TABLE "product_addon_groups" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "product_addon_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "addon_options_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_selectedAddOnOptionId_fkey" FOREIGN KEY ("selectedAddOnOptionId") REFERENCES "addon_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_addon_groups" ADD CONSTRAINT "product_addon_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_addon_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
