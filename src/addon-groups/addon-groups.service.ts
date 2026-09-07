import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddOnGroupDto } from './dto/create-addon-group.dto';

@Injectable()
export class AddOnGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateAddOnGroupDto) {
    return this.prisma.addOnGroup.create({ data: { name: dto.name } });
  }

  // Catalogo completo para el Administrador (crear/editar opciones e imagenes
  // en un solo lugar, ver AddOnOptionsController), independiente de a que
  // productos este asociado cada grupo - ver ProductAddOnGroup.
  findAll() {
    return this.prisma.addOnGroup.findMany({
      include: { options: true },
      orderBy: { name: 'asc' },
    });
  }
}
