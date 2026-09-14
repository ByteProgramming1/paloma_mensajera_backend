-- AlterTable
ALTER TABLE "addon_groups" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "addon_options" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: no existe columna de fecha de creacion, asi que se usa el orden
-- fisico actual de las filas (ctid) como mejor aproximacion al orden de
-- creacion para los datos que ya existen. Las filas nuevas reciben su
-- position explicitamente desde la app (max actual + 1).
UPDATE "addon_groups" AS g
SET "position" = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY ctid) AS rn
  FROM "addon_groups"
) AS ranked
WHERE g.id = ranked.id;

UPDATE "addon_options" AS o
SET "position" = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "groupId" ORDER BY ctid) AS rn
  FROM "addon_options"
) AS ranked
WHERE o.id = ranked.id;
