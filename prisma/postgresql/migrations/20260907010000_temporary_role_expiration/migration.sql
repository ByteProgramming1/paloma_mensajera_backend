-- AlterTable
ALTER TABLE "users" ADD COLUMN "roleExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "rolePreviousId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rolePreviousId_fkey" FOREIGN KEY ("rolePreviousId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
