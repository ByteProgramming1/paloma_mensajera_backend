import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const permissions = await this.prisma.permission.findMany({
      where: { slug: { in: dto.permissionSlugs } },
    });

    if (permissions.length !== dto.permissionSlugs.length) {
      const found = new Set(permissions.map((p) => p.slug));
      const missing = dto.permissionSlugs.filter((slug) => !found.has(slug));
      throw new BadRequestException(`Permisos inexistentes: ${missing.join(', ')}`);
    }

    return this.prisma.role.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        isSystem: false,
        permissions: {
          create: permissions.map((permission) => ({ permissionId: permission.id })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  findAll() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });
  }
}
