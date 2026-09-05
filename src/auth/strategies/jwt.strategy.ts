import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../jwt-payload.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // El rol de una persona puede rotar varias veces por semana (seccion 6 del
    // SDD), asi que el claim `roleSlug`/`permissions` del JWT ya emitido no es
    // fuente de verdad confiable durante toda su vigencia: se re-consulta el
    // rol y los permisos vigentes en cada request en vez de confiar en el
    // token (seccion 9.3). `isActive` false invalida la sesion de inmediato,
    // sin esperar a que el token expire.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Cuenta inactiva o inexistente.');
    }

    if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('La cuenta temporal ha expirado.');
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      roleSlug: user.role.slug,
      permissions: user.role.permissions.map((rp) => rp.permission.slug),
    };
  }
}
