import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { CreateAddOnOptionDto } from './dto/create-addon-option.dto';
import { UpdateAddOnOptionDto } from './dto/update-addon-option.dto';

@Injectable()
export class AddOnOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorageService: ImageStorageService,
  ) {}

  async create(dto: CreateAddOnOptionDto) {
    const group = await this.prisma.productAddOnGroup.findUnique({ where: { id: dto.groupId } });
    if (!group) {
      throw new BadRequestException(`El grupo de acompañantes '${dto.groupId}' no existe.`);
    }

    return this.prisma.addOnOption.create({
      data: { groupId: dto.groupId, name: dto.name },
    });
  }

  async update(id: string, dto: UpdateAddOnOptionDto) {
    await this.findOneOrThrow(id);
    return this.prisma.addOnOption.update({ where: { id }, data: dto });
  }

  // Sube la imagen al almacenamiento configurado (mismo patron que
  // ProductsService.updateImage) y actualiza AddOnOption.imageUrl.
  async updateImage(id: string, file?: Express.Multer.File) {
    await this.findOneOrThrow(id);
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo de imagen.');
    }

    const imageUrl = await this.imageStorageService.saveAddOnOptionImage(id, file);
    return this.prisma.addOnOption.update({ where: { id }, data: { imageUrl } });
  }

  private async findOneOrThrow(id: string) {
    const option = await this.prisma.addOnOption.findUnique({ where: { id } });
    if (!option) {
      throw new NotFoundException(`Opcion de acompañante '${id}' no encontrada.`);
    }
    return option;
  }
}
