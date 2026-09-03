import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: { ...dto, isActive: dto.isActive ?? true },
    });
  }

  findActive() {
    return this.prisma.product.findMany({ where: { isActive: true } });
  }

  findAll() {
    return this.prisma.product.findMany();
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOneOrThrow(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  private async findOneOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Producto '${id}' no encontrado.`);
    }
    return product;
  }
}
