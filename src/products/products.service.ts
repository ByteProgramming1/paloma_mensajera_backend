import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateAddOnGroupDto } from './dto/create-addon-group.dto';

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

  // Incluye los grupos de acompañantes con sus opciones activas (ej. "Elige tu
  // carta") para que el comprador pueda elegir una al agregar el producto al
  // carrito - ver CartItemDto.selectedAddOnOptionId.
  findActive() {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        addOnGroups: {
          include: { options: { where: { isActive: true } } },
        },
      },
    });
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

  async createAddOnGroup(productId: string, dto: CreateAddOnGroupDto) {
    await this.findOneOrThrow(productId);
    return this.prisma.productAddOnGroup.create({
      data: { productId, name: dto.name },
      include: { options: true },
    });
  }

  private async findOneOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Producto '${id}' no encontrado.`);
    }
    return product;
  }
}
