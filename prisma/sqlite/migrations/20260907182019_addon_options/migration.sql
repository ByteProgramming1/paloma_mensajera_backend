-- CreateTable
CREATE TABLE "product_addon_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "product_addon_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "addon_options" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "addon_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_addon_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_order_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "selectedAddOnOptionId" TEXT,
    CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_items_selectedAddOnOptionId_fkey" FOREIGN KEY ("selectedAddOnOptionId") REFERENCES "addon_options" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_order_items" ("id", "orderId", "productId", "quantity", "unitPrice") SELECT "id", "orderId", "productId", "quantity", "unitPrice" FROM "order_items";
DROP TABLE "order_items";
ALTER TABLE "new_order_items" RENAME TO "order_items";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
