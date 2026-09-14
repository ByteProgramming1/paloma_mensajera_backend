import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddOnGroupDto } from './dto/create-addon-group.dto';

@Injectable()
export class AddOnGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAddOnGroupDto) {
    const lastGroup = await this.prisma.addOnGroup.findFirst({ orderBy: { position: 'desc' } });
    return this.prisma.addOnGroup.create({
      data: { name: dto.name, position: (lastGroup?.position ?? 0) + 1 },
    });
  }

  // Catalogo completo para el Administrador (crear/editar opciones e imagenes
  // en un solo lugar, ver AddOnOptionsController), independiente de a que
  // productos este asociado cada grupo - ver ProductAddOnGroup. Se listan en
  // el orden en que el admin los fue creando, no alfabeticamente.
  findAll() {
    return this.prisma.addOnGroup.findMany({
      include: { options: { orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' },
    });
  }
}
