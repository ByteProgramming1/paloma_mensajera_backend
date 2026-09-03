import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { MicrosoftAuthService } from './microsoft/microsoft-auth.service';
import { LoginDto } from './dto/login.dto';
import { MicrosoftLoginDto } from './dto/microsoft-login.dto';
import { CreateTemporaryUserDto } from './dto/create-temporary-user.dto';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly microsoftAuthService: MicrosoftAuthService,
    private readonly configService: ConfigService,
  ) {}

  // Acepta varios dominios institucionales separados por coma (ej. profesores
  // en @escuelaing.edu.co, estudiantes en @mail.escuelaing.edu.co).
  private getInstitutionalDomains(): string[] {
    return this.configService
      .get<string>('INSTITUTIONAL_EMAIL_DOMAIN')!
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
  }

  private assertInstitutionalEmail(email: string) {
    const domains = this.getInstitutionalDomains();
    const normalizedEmail = email.toLowerCase();
    const isAllowed = domains.some((domain) => normalizedEmail.endsWith(`@${domain}`));
    if (!isAllowed) {
      throw new ForbiddenException(
        `Solo se permiten correos institucionales de: ${domains.join(', ')}.`,
      );
    }
  }

  private async loadRoleWithPermissions(roleId: string) {
    return this.prisma.role.findUniqueOrThrow({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  private buildPayload(
    user: {
      id: string;
      email: string;
      name: string;
    },
    role: Awaited<ReturnType<AuthService['loadRoleWithPermissions']>>,
  ): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      roleSlug: role.slug,
      permissions: role.permissions.map((rp) => rp.permission.slug),
    };
  }

  private async issueSession(user: { id: string; email: string; name: string; roleId: string }) {
    const role = await this.loadRoleWithPermissions(user.roleId);
    const payload = this.buildPayload(user, role);

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: role.slug,
      },
    };
  }

  async login(dto: LoginDto) {
    this.assertInstitutionalEmail(dto.email);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('La cuenta temporal ha expirado.');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Esta cuenta inicia sesion con la cuenta institucional de Microsoft.',
      );
    }

    const passwordMatches = await this.passwordService.verify(user.password, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    return this.issueSession(user);
  }

  // Login con la cuenta institucional de Microsoft (Entra ID). No crea cuentas
  // nuevas: el correo debe haber sido pre-autorizado por un administrador con
  // POST /auth/temporary-user (o el seed inicial) y tener asignado un rol.
  async loginWithMicrosoft(dto: MicrosoftLoginDto) {
    const claims = await this.microsoftAuthService.validateIdToken(dto.idToken);
    this.assertInstitutionalEmail(claims.email);

    const user = await this.prisma.user.findUnique({ where: { email: claims.email } });
    if (!user || !user.isActive) {
      throw new ForbiddenException(
        'Esta cuenta de Microsoft no esta autorizada. Solicita al administrador que te asigne un rol.',
      );
    }

    if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('La cuenta temporal ha expirado.');
    }

    if (user.microsoftId && user.microsoftId !== claims.microsoftId) {
      throw new UnauthorizedException('La cuenta de Microsoft no coincide con la registrada.');
    }

    if (!user.microsoftId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { microsoftId: claims.microsoftId },
      });
    }

    return this.issueSession(user);
  }

  async createTemporaryUser(dto: CreateTemporaryUserDto) {
    this.assertInstitutionalEmail(dto.email);

    const role = await this.prisma.role.findUnique({ where: { slug: dto.roleSlug } });
    if (!role) {
      throw new UnauthorizedException(`El rol '${dto.roleSlug}' no existe.`);
    }

    const passwordHash = dto.password ? await this.passwordService.hash(dto.password) : null;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: passwordHash,
        roleId: role.id,
        expiresAt: new Date(dto.expiresAt),
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: role.slug,
      expiresAt: user.expiresAt,
    };
  }
}
