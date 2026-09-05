import { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { Permissions } from '../../common/enums/permissions';
import { RoleSlug } from '../../common/enums/domain.enums';

function buildContext(user?: { roleSlug: string; permissions: string[] }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('permite el paso si el handler no exige permisos ni adminOnly', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('rechaza si no hay usuario autenticado pero se exige un permiso', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce([Permissions.ORDERS_VERIFY_PAYMENT])
        .mockReturnValueOnce(undefined),
    } as never;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow('No autenticado.');
  });

  it('rechaza si adminOnly y el usuario no es admin', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(undefined).mockReturnValueOnce(true),
    } as never;
    const guard = new PermissionsGuard(reflector);
    const context = buildContext({ roleSlug: RoleSlug.SELLER, permissions: [] });

    expect(() => guard.canActivate(context)).toThrow('requiere el rol de administrador');
  });

  it('permite a un admin pasar un endpoint adminOnly', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(undefined).mockReturnValueOnce(true),
    } as never;
    const guard = new PermissionsGuard(reflector);
    const context = buildContext({ roleSlug: RoleSlug.ADMIN, permissions: [] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rechaza si al usuario le falta alguno de los permisos requeridos', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce([Permissions.ORDERS_VERIFY_PAYMENT, Permissions.ORDERS_READ_ALL])
        .mockReturnValueOnce(undefined),
    } as never;
    const guard = new PermissionsGuard(reflector);
    const context = buildContext({
      roleSlug: RoleSlug.ADMIN,
      permissions: [Permissions.ORDERS_VERIFY_PAYMENT],
    });

    expect(() => guard.canActivate(context)).toThrow('No tiene permisos suficientes');
  });

  it('permite el paso cuando el usuario tiene todos los permisos requeridos', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce([Permissions.ORDERS_VERIFY_PAYMENT])
        .mockReturnValueOnce(undefined),
    } as never;
    const guard = new PermissionsGuard(reflector);
    const context = buildContext({
      roleSlug: RoleSlug.ADMIN,
      permissions: [Permissions.ORDERS_VERIFY_PAYMENT],
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
