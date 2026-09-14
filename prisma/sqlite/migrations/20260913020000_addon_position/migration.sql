-- AlterTable
ALTER TABLE "addon_groups" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "addon_options" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: no existe columna de fecha de creacion, asi que se usa el orden
-- fisico actual de las filas (rowid) como mejor aproximacion al orden de
-- creacion para los datos que ya existen. Las filas nuevas reciben su
-- position explicitamente desde la app (max actual + 1).
UPDATE "addon_groups"
SET "position" = (
  SELECT COUNT(*) FROM "addon_groups" AS g2 WHERE g2.rowid <= "addon_groups".rowid
);

UPDATE "addon_options"
SET "position" = (
  SELECT COUNT(*) FROM "addon_options" AS o2
  WHERE o2."groupId" = "addon_options"."groupId" AND o2.rowid <= "addon_options".rowid
);
