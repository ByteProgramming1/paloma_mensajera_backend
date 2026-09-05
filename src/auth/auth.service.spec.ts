import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// jwks-rsa (usado por MicrosoftAuthService) depende de un paquete ESM-only
// (jose) que Jest no puede transformar via CommonJS; como este spec ya pasa un
// mock plano para microsoftAuthService, no hace falta cargar la implementacion
// real - se mockea el modulo completo (con una factory, para que ni siquiera
// se importe jwks-rsa al generar el automock) desde el primer momento.
jest.mock('./microsoft/microsoft-auth.service', () => ({
  MicrosoftAuthService: jest.fn(),
}));

function buildDeps(institutionalDomains = 'escuelaing.edu.co,mail.escuelaing.edu.co') {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    role: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
  const passwordService = { verify: jest.fn(), hash: jest.fn() };
  const microsoftAuthService = { validateIdToken: jest.fn() };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'INSTITUTIONAL_EMAIL_DOMAIN' ? institutionalDomains : undefined,
    ),
  };

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    passwordService as never,
    microsoftAuthService as never,
    configService as never,
  );

  return { service, prisma, jwtService, passwordService, microsoftAuthService };
}

describe('AuthService', () => {
  describe('login - dominio institucional', () => {
    it('rechaza un correo fuera de los dominios institucionales', async () => {
      const { service } = buildDeps();

      await expect(service.login({ email: 'persona@gmail.com', password: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('acepta el dominio de profesores y el de estudiantes', async () => {
      const { service, prisma, passwordService } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'profe@escuelaing.edu.co',
        name: 'Profe',
        password: 'hash',
        isActive: true,
        expiresAt: null,
        roleId: 'r1',
      });
      prisma.role.findUniqueOrThrow.mockResolvedValue({
        slug: 'admin',
        permissions: [],
      });
      passwordService.verify.mockResolvedValue(true);

      const result = await service.login({ email: 'profe@escuelaing.edu.co', password: 'x' });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.role).toBe('admin');
    });
  });

  describe('login - credenciales', () => {
    it('rechaza si el usuario no existe', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nadie@escuelaing.edu.co', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si la cuenta esta desactivada', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({ isActive: false });

      await expect(
        service.login({ email: 'inactivo@escuelaing.edu.co', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si la cuenta temporal expiro', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
        password: 'hash',
      });

      await expect(
        service.login({ email: 'expirado@escuelaing.edu.co', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si la cuenta es solo-Microsoft (sin password local)', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        expiresAt: null,
        password: null,
      });

      await expect(
        service.login({ email: 'sso@escuelaing.edu.co', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si la contrasena no coincide', async () => {
      const { service, prisma, passwordService } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        expiresAt: null,
        password: 'hash',
      });
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'user@escuelaing.edu.co', password: 'mala' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('createTemporaryUser', () => {
    it('rechaza un roleSlug inexistente', async () => {
      const { service, prisma } = buildDeps();
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.createTemporaryUser({
          email: 'nuevo@escuelaing.edu.co',
          name: 'Nuevo',
          roleSlug: 'inexistente',
          expiresAt: new Date().toISOString(),
        } as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('crea la cuenta sin password cuando no se envia (solo-Microsoft)', async () => {
      const { service, prisma, passwordService } = buildDeps();
      prisma.role.findUnique.mockResolvedValue({ id: 'role1', slug: 'seller' });
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'nuevo@escuelaing.edu.co',
        name: 'Nuevo',
        expiresAt: new Date(),
      });

      await service.createTemporaryUser({
        email: 'nuevo@escuelaing.edu.co',
        name: 'Nuevo',
        roleSlug: 'seller',
        expiresAt: new Date().toISOString(),
      } as never);

      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(prisma.user.create.mock.calls[0][0].data.password).toBeNull();
    });
  });
});
