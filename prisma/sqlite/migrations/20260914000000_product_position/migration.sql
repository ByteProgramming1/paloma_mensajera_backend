-- AlterTable
ALTER TABLE "products" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: no existe columna de fecha de creacion, asi que se usa el orden
-- fisico actual de las filas (rowid) como mejor aproximacion al orden de
-- creacion para los datos que ya existen. Las filas nuevas reciben su
-- position explicitamente desde la app (max actual + 1).
UPDATE "products"
SET "position" = (
  SELECT COUNT(*) FROM "products" AS p2 WHERE p2.rowid <= "products".rowid
);
