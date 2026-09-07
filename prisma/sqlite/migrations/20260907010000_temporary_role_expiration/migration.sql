-- AlterTable
ALTER TABLE "users" ADD COLUMN "roleExpiresAt" DATETIME;
ALTER TABLE "users" ADD COLUMN "rolePreviousId" TEXT;

-- AddForeignKey
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "microsoftId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roleAssignedByAdminId" TEXT,
    "roleAssignedAt" DATETIME,
    "roleExpiresAt" DATETIME,
    "rolePreviousId" TEXT,
    CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "users_roleAssignedByAdminId_fkey" FOREIGN KEY ("roleAssignedByAdminId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "users_rolePreviousId_fkey" FOREIGN KEY ("rolePreviousId") REFERENCES "roles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("createdAt", "email", "expiresAt", "id", "isActive", "microsoftId", "name", "password", "roleAssignedAt", "roleAssignedByAdminId", "roleExpiresAt", "roleId", "rolePreviousId") SELECT "createdAt", "email", "expiresAt", "id", "isActive", "microsoftId", "name", "password", "roleAssignedAt", "roleAssignedByAdminId", "roleExpiresAt", "roleId", "rolePreviousId" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_microsoftId_key" ON "users"("microsoftId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
