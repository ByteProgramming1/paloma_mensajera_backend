import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReassignRoleDto } from './dto/reassign-role.dto';
import { ToggleUserStatusDto } from './dto/toggle-user-status.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Listado de staff para las pantallas de gestion de roles/turnos y el
  // selector de "asignar vendedor a esta entrega" (seccion 6/7 del SDD). Sin
  // filtro explicito, excluye 'comprador': este endpoint es para gestionar
  // staff, no para exponer la lista de compradores.
  async findAll(roleFilter?: string) {
    const roleSlugs = roleFilter
      ? roleFilter
          .split(',')
          .map((slug) => slug.trim())
          .filter(Boolean)
      : undefined;

    return this.prisma.user.findMany({
      where: roleSlugs ? { role: { slug: { in: roleSlugs } } } : { role: { slug: { not: 'comprador' } } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
        role: { select: { slug: true, name: true } },
      },
    });
  }

  // Reasigna el rol vigente de un usuario sin crear una cuenta nueva, para
  // acomodar la rotacion de turnos del equipo (seccion 6 del SDD).
  async reassignRole(adminId: string, userId: string, dto: ReassignRoleDto) {
    await this.findUserOrThrow(userId);

    const role = await this.prisma.role.findUnique({ where: { slug: dto.newRole } });
    if (!role) {
      throw new BadRequestException(`El rol '${dto.newRole}' no existe.`);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { roleId: role.id, roleAssignedByAdminId: adminId, roleAssignedAt: new Date() },
      select: {
        id: true,
        email: true,
        name: true,
        roleAssignedAt: true,
        role: { select: { slug: true } },
      },
    });
  }

  // Activa o desactiva el acceso de un usuario. Como el rol/estado se
  // re-consulta en cada request (ver JwtStrategy), desactivar invalida de
  // inmediato cualquier sesion vigente sin necesitar una lista de revocacion.
  async toggleStatus(adminId: string, userId: string, dto: ToggleUserStatusDto) {
    if (userId === adminId && !dto.isActive) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta de administrador.');
    }
    await this.findUserOrThrow(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: { id: true, email: true, name: true, isActive: true },
    });
  }

  private async findUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Usuario '${userId}' no encontrado.`);
    }
    return user;
  }
}
