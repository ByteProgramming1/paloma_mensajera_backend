import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/enums/permissions';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MicrosoftLoginDto } from './dto/microsoft-login.dto';
import { CreateTemporaryUserDto } from './dto/create-temporary-user.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Auto-registro con verificacion de correo (ver AuthService.register):
  // vuelve a ser el mecanismo principal de acceso institucional. Se intento
  // Microsoft SSO como alternativa, pero requiere un directorio de Entra ID
  // propio para registrar la app (Microsoft ya no permite crear apps sin uno)
  // y eso implicaba tarjeta de credito/debito - descartado por decision del
  // equipo. loginWithMicrosoft se deja disponible por si mas adelante alguien
  // consigue un directorio sin tarjeta (M365 Dev Program, GitHub Student Pack).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // Login con la cuenta institucional de Microsoft (Entra ID) - ver
  // AuthService.loginWithMicrosoft. Responde 503 mientras AZURE_AD_TENANT_ID/
  // AZURE_AD_CLIENT_ID no esten configurados (ver seccion correspondiente del
  // README) - no es la via principal por ahora, ver comentario de register().
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('microsoft')
  loginWithMicrosoft(@Body() dto: MicrosoftLoginDto) {
    return this.authService.loginWithMicrosoft(dto);
  }

  @RequirePermissions(Permissions.USERS_MANAGE_TEMP)
  @Post('temporary-user')
  createTemporaryUser(@Body() dto: CreateTemporaryUserDto) {
    return this.authService.createTemporaryUser(dto);
  }

  // Permite al frontend revalidar rol/permisos vigentes sin re-loguear (el
  // accessToken sigue siendo valido, solo puede tener roleSlug/permissions
  // obsoletos si un admin reasigno el rol despues de emitido). No requiere
  // permisos especiales: solo estar autenticado. `user` ya viene fresco desde
  // JwtStrategy.validate(), que re-consulta la BD en cada request.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      user: { id: user.userId, email: user.email, name: user.name, role: user.roleSlug },
      roleSlug: user.roleSlug,
      permissions: user.permissions,
    };
  }
}
