-- Los grupos de acompañantes dejan de ser 1:1 por producto (ProductAddOnGroup
-- con productId+name) y pasan a ser un catalogo reutilizable (AddOnGroup) que
-- se asocia a cualquier producto via la tabla de union ProductAddOnGroup. Los
-- datos existentes son de la fase de pruebas (sin pedidos reales que dependan
-- de un acompañante especifico) y no tienen forma automatica de mapearse al
-- nuevo modelo, asi que se limpian antes del cambio de forma.
UPDATE "order_items" SET "selectedAddOnOptionId" = NULL;
DELETE FROM "addon_options";

-- DropForeignKey
ALTER TABLE "addon_options" DROP CONSTRAINT "addon_options_groupId_fkey";

-- DropTable
DROP TABLE "product_addon_groups";

-- CreateTable
CREATE TABLE "addon_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "addon_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_addon_group_links" (
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "product_addon_group_links_pkey" PRIMARY KEY ("productId","groupId")
);

-- AddForeignKey
ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "addon_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_addon_group_links" ADD CONSTRAINT "product_addon_group_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_addon_group_links" ADD CONSTRAINT "product_addon_group_links_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "addon_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
