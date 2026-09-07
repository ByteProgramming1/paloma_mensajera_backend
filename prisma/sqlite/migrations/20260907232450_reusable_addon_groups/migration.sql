-- Los grupos de acompañantes dejan de ser 1:1 por producto (ProductAddOnGroup
-- con productId+name) y pasan a ser un catalogo reutilizable (AddOnGroup) que
-- se asocia a cualquier producto via la tabla de union ProductAddOnGroup. Los
-- datos existentes son de la fase de pruebas (sin pedidos reales que dependan
-- de un acompañante especifico) y no tienen forma automatica de mapearse al
-- nuevo modelo, asi que se limpian antes del cambio de forma.
UPDATE "order_items" SET "selectedAddOnOptionId" = NULL;
DELETE FROM "addon_options";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "product_addon_groups";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "addon_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "product_addon_group_links" (
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    PRIMARY KEY ("productId", "groupId"),
    CONSTRAINT "product_addon_group_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_addon_group_links_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "addon_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_addon_options" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "addon_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "addon_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_addon_options" ("groupId", "id", "imageUrl", "isActive", "name") SELECT "groupId", "id", "imageUrl", "isActive", "name" FROM "addon_options";
DROP TABLE "addon_options";
ALTER TABLE "new_addon_options" RENAME TO "addon_options";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
