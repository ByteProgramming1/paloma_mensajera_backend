import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { LoginDto } from './dto/login.dto';
import { CreateTemporaryUserDto } from './dto/create-temporary-user.dto';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
  ) {}

  private assertInstitutionalEmail(email: string) {
    const domain = this.configService.get<string>('INSTITUTIONAL_EMAIL_DOMAIN')!;
    if (!email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
      throw new ForbiddenException(
        `Solo se permiten correos institucionales del dominio ${domain}.`,
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

  async login(dto: LoginDto) {
    this.assertInstitutionalEmail(dto.email);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('La cuenta temporal ha expirado.');
    }

    const passwordMatches = await this.passwordService.verify(user.password, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

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

  async createTemporaryUser(dto: CreateTemporaryUserDto) {
    this.assertInstitutionalEmail(dto.email);

    const role = await this.prisma.role.findUnique({ where: { slug: dto.roleSlug } });
    if (!role) {
      throw new UnauthorizedException(`El rol '${dto.roleSlug}' no existe.`);
    }

    const passwordHash = await this.passwordService.hash(dto.password);

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
