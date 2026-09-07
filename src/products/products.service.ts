import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorageService: ImageStorageService,
  ) {}

  create(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: { ...dto, isActive: dto.isActive ?? true },
    });
  }

  // Incluye los grupos de acompañantes (reutilizables, ver AddOnGroup) con sus
  // opciones activas (ej. "Elige tu carta") para que el comprador pueda elegir
  // una al agregar el producto al carrito - ver CartItemDto.selectedAddOnOptionId.
  // Se aplana la tabla de union (addOnGroupLinks) para mantener el mismo
  // contrato externo `addOnGroups: [...]` de antes del catalogo reutilizable.
  async findActive() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        addOnGroupLinks: {
          include: { group: { include: { options: { where: { isActive: true } } } } },
        },
      },
    });

    return products.map(({ addOnGroupLinks, ...product }) => ({
      ...product,
      addOnGroups: addOnGroupLinks.map((link) => link.group),
    }));
  }

  findAll() {
    return this.prisma.product.findMany();
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOneOrThrow(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  // Sube la imagen al almacenamiento configurado (seccion 9 del SDD) y
  // actualiza Product.imageUrl - nunca se guarda el binario en la base de datos.
  async updateImage(id: string, file?: Express.Multer.File) {
    await this.findOneOrThrow(id);
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo de imagen.');
    }

    const imageUrl = await this.imageStorageService.saveProductImage(id, file);
    return this.prisma.product.update({ where: { id }, data: { imageUrl } });
  }

  // Asocia un grupo de acompañantes YA EXISTENTE (ver AddOnGroupsController)
  // al producto - no crea nada nuevo, permite reutilizar el mismo catalogo
  // (ej. "Cartas") en varios combos. Idempotente: asociar dos veces el mismo
  // grupo no falla ni duplica la fila.
  async linkAddOnGroup(productId: string, groupId: string) {
    await this.findOneOrThrow(productId);
    const group = await this.prisma.addOnGroup.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new BadRequestException(`El grupo de acompañantes '${groupId}' no existe.`);
    }

    return this.prisma.productAddOnGroup.upsert({
      where: { productId_groupId: { productId, groupId } },
      update: {},
      create: { productId, groupId },
      include: { group: { include: { options: true } } },
    });
  }

  async unlinkAddOnGroup(productId: string, groupId: string) {
    await this.prisma.productAddOnGroup.deleteMany({ where: { productId, groupId } });
  }

  private async findOneOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Producto '${id}' no encontrado.`);
    }
    return product;
  }
}
