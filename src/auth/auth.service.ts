import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { MicrosoftAuthService } from './microsoft/microsoft-auth.service';
import { MailerService } from '../mailer/mailer.service';
import { LoginDto } from './dto/login.dto';
import { MicrosoftLoginDto } from './dto/microsoft-login.dto';
import { CreateTemporaryUserDto } from './dto/create-temporary-user.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtPayload } from './jwt-payload.interface';

const VERIFICATION_CODE_TTL_MINUTES = 15;
// Unico rol pensado para auto-registro (ver register()). No forma parte del
// enum RoleSlug porque ese enum solo cubre los roles operativos internos
// (admin/seller/etc.); "comprador" vive como fila normal en la tabla Role,
// igual que en ROLE_PERMISSION_MATRIX (src/common/enums/permissions.ts).
const SELF_REGISTRATION_ROLE_SLUG = 'comprador';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly microsoftAuthService: MicrosoftAuthService,
    private readonly mailerService: MailerService,
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

    // Solo aplica a cuentas auto-registradas (ver register()): las que crea un
    // admin (createTemporaryUser) quedan verificadas desde el inicio.
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Debes verificar tu correo antes de iniciar sesion. Revisa tu bandeja de entrada.',
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

    if (!user.microsoftId || !user.emailVerifiedAt) {
      // Un login real de Microsoft ya prueba la identidad de forma mas fuerte
      // que nuestro propio codigo por correo, asi que de paso queda verificada.
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          microsoftId: claims.microsoftId,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
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

    // Un admin ya da fe de la identidad de esta persona, asi que la cuenta
    // queda verificada desde el inicio (no pasa por el flujo de register()).
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: passwordHash,
        roleId: role.id,
        expiresAt: new Date(dto.expiresAt),
        emailVerifiedAt: new Date(),
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

  // Auto-registro (sin admin ni Microsoft SSO): cualquiera con un correo
  // institucional puede crear su propia cuenta, pero queda pendiente hasta que
  // confirme el codigo enviado a su bandeja (ver verifyEmail). Rol por defecto:
  // `comprador`, el unico pensado para autoservicio.
  async register(dto: RegisterDto) {
    this.assertInstitutionalEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing?.emailVerifiedAt) {
      throw new ConflictException(
        'Ya existe una cuenta verificada con este correo. Inicia sesion.',
      );
    }

    const compradorRole = await this.prisma.role.findUnique({
      where: { slug: SELF_REGISTRATION_ROLE_SLUG },
    });
    if (!compradorRole) {
      throw new BadRequestException('El rol de comprador no esta configurado en el sistema.');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { name: dto.name, password: passwordHash },
        })
      : await this.prisma.user.create({
          data: {
            email: dto.email,
            name: dto.name,
            password: passwordHash,
            roleId: compradorRole.id,
          },
        });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } });
    await this.prisma.emailVerificationCode.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000),
      },
    });

    await this.mailerService.sendVerificationCode(user.email, code, user.name);

    return {
      message: 'Te enviamos un codigo de verificacion a tu correo institucional.',
      email: user.email,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new NotFoundException('No hay ninguna cuenta con ese correo.');
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Esta cuenta ya fue verificada. Inicia sesion normalmente.');
    }

    const validCode = await this.prisma.emailVerificationCode.findFirst({
      where: { userId: user.id, code: dto.code, expiresAt: { gt: new Date() } },
    });
    if (!validCode) {
      throw new BadRequestException('El codigo es invalido o ya expiro.');
    }

    const verifiedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.emailVerificationCode.deleteMany({ where: { userId: user.id } });
      return updated;
    });

    return this.issueSession(verifiedUser);
  }
}
