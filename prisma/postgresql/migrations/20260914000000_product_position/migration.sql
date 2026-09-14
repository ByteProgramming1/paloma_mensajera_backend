-- AlterTable
ALTER TABLE "products" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: no existe columna de fecha de creacion, asi que se usa el orden
-- fisico actual de las filas (ctid) como mejor aproximacion al orden de
-- creacion para los datos que ya existen. Las filas nuevas reciben su
-- position explicitamente desde la app (max actual + 1).
UPDATE "products" AS p
SET "position" = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY ctid) AS rn
  FROM "products"
) AS ranked
WHERE p.id = ranked.id;
