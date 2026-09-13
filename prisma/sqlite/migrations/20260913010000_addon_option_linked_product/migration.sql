-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_addon_options" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "linkedProductId" TEXT,
    CONSTRAINT "addon_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "addon_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "addon_options_linkedProductId_fkey" FOREIGN KEY ("linkedProductId") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_addon_options" ("id", "groupId", "name", "imageUrl", "isActive") SELECT "id", "groupId", "name", "imageUrl", "isActive" FROM "addon_options";
DROP TABLE "addon_options";
ALTER TABLE "new_addon_options" RENAME TO "addon_options";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
