import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
    emailVerificationCode: {
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
  const passwordService = { verify: jest.fn(), hash: jest.fn() };
  const microsoftAuthService = { validateIdToken: jest.fn() };
  const mailerService = { sendVerificationCode: jest.fn() };
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
    mailerService as never,
    configService as never,
  );

  return { service, prisma, jwtService, passwordService, microsoftAuthService, mailerService };
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
        emailVerifiedAt: new Date(),
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

    it('rechaza si el correo aun no fue verificado (auto-registro pendiente)', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        expiresAt: null,
        password: 'hash',
        emailVerifiedAt: null,
      });

      await expect(
        service.login({ email: 'pendiente@escuelaing.edu.co', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si la contrasena no coincide', async () => {
      const { service, prisma, passwordService } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        expiresAt: null,
        password: 'hash',
        emailVerifiedAt: new Date(),
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

  describe('register', () => {
    it('rechaza un correo fuera de los dominios institucionales', async () => {
      const { service } = buildDeps();

      await expect(
        service.register({ email: 'x@gmail.com', name: 'X', password: 'password123' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si ya existe una cuenta verificada con ese correo', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: new Date() });

      await expect(
        service.register({
          email: 'ya@escuelaing.edu.co',
          name: 'Ya',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza si el rol comprador no esta configurado', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.register({
          email: 'nuevo@escuelaing.edu.co',
          name: 'Nuevo',
          password: 'password123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea la cuenta sin verificar, genera un codigo y envia el correo', async () => {
      const { service, prisma, passwordService, mailerService } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'role-comprador', slug: 'comprador' });
      passwordService.hash.mockResolvedValue('hashed');
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'nuevo@escuelaing.edu.co',
        name: 'Nuevo',
      });

      const result = await service.register({
        email: 'nuevo@escuelaing.edu.co',
        name: 'Nuevo',
        password: 'password123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'nuevo@escuelaing.edu.co',
            password: 'hashed',
            roleId: 'role-comprador',
          }),
        }),
      );
      expect(prisma.emailVerificationCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.emailVerificationCode.create).toHaveBeenCalled();
      expect(mailerService.sendVerificationCode).toHaveBeenCalledWith(
        'nuevo@escuelaing.edu.co',
        expect.stringMatching(/^\d{6}$/),
      );
      expect(result.email).toBe('nuevo@escuelaing.edu.co');
    });

    it('reenvia un nuevo codigo si la cuenta existe pero aun no esta verificada', async () => {
      const { service, prisma, passwordService, mailerService } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'pendiente@escuelaing.edu.co',
        emailVerifiedAt: null,
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'role-comprador', slug: 'comprador' });
      passwordService.hash.mockResolvedValue('hashed');
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'pendiente@escuelaing.edu.co',
        name: 'Pendiente',
      });

      await service.register({
        email: 'pendiente@escuelaing.edu.co',
        name: 'Pendiente',
        password: 'password123',
      });

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
      expect(mailerService.sendVerificationCode).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('rechaza si el usuario no existe', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyEmail({ email: 'nadie@escuelaing.edu.co', code: '123456' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la cuenta ya estaba verificada', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: new Date() });

      await expect(
        service.verifyEmail({ email: 'ya@escuelaing.edu.co', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un codigo invalido o expirado', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: null });
      prisma.emailVerificationCode.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyEmail({ email: 'pendiente@escuelaing.edu.co', code: '000000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('marca la cuenta como verificada, borra el codigo y devuelve una sesion', async () => {
      const { service, prisma } = buildDeps();
      const user = { id: 'u1', email: 'pendiente@escuelaing.edu.co', emailVerifiedAt: null };
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.emailVerificationCode.findFirst.mockResolvedValue({ id: 'code1' });
      prisma.role.findUniqueOrThrow.mockResolvedValue({ slug: 'comprador', permissions: [] });

      const tx = {
        user: { update: jest.fn().mockResolvedValue({ ...user, emailVerifiedAt: new Date() }) },
        emailVerificationCode: { deleteMany: jest.fn() },
      };
      type Tx = typeof tx;
      prisma.$transaction.mockImplementation((callback: (tx: Tx) => unknown) => callback(tx));

      const result = await service.verifyEmail({
        email: 'pendiente@escuelaing.edu.co',
        code: '123456',
      });

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(tx.emailVerificationCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
    });
  });
});
