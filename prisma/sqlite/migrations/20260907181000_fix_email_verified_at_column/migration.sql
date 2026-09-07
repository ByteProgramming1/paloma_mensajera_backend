-- Restaura "emailVerifiedAt" en users, eliminada sin querer por la migracion
-- 20260907010000_temporary_role_expiration: al agregar el FK de
-- rolePreviousId, SQLite obliga a reconstruir la tabla (RedefineTables) y esa
-- migracion no incluyo emailVerifiedAt ni en el CREATE TABLE "new_users" ni en
-- el INSERT...SELECT de copia, asi que la columna se perdio silenciosamente
-- para cualquier entorno SQLite que la aplique. PostgreSQL (motor de
-- produccion) no se vio afectado: su migracion equivalente solo hace
-- ALTER TABLE ADD COLUMN / ADD CONSTRAINT, sin reconstruir la tabla.
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" DATETIME;
