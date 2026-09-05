import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permissions } from '../common/enums/permissions';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MicrosoftLoginDto } from './dto/microsoft-login.dto';
import { CreateTemporaryUserDto } from './dto/create-temporary-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // POST /auth/register y /auth/verify-email (auto-registro con codigo por
  // correo) quedan deshabilitados: el acceso institucional se resuelve con
  // Microsoft SSO (ver loginWithMicrosoft), que da mejor experiencia y ya fue
  // validado como viable sin depender de TI (app registration con una cuenta
  // personal + validacion de dominio en AuthService.assertInstitutionalEmail).
  // AuthService.register/verifyEmail y su schema (emailVerifiedAt,
  // EmailVerificationCode) se dejan intactos por si se retoma mas adelante.

  // Login con la cuenta institucional de Microsoft (Entra ID) - ver AuthService.loginWithMicrosoft.
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
}
