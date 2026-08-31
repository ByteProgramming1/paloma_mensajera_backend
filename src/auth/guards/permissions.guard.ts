import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ADMIN_ONLY_KEY } from '../../common/decorators/admin-only.decorator';
import { Permissions } from '../../common/enums/permissions';
import { RoleSlug } from '../../common/enums/domain.enums';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permissions[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredPermissions || requiredPermissions.length === 0) && !adminOnly) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('No autenticado.');
    }

    if (adminOnly && user.roleSlug !== RoleSlug.ADMIN) {
      throw new ForbiddenException('Esta accion requiere el rol de administrador.');
    }

    const hasAllPermissions = (requiredPermissions ?? []).every((permission) =>
      user.permissions.includes(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('No tiene permisos suficientes para esta accion.');
    }

    return true;
  }
}
