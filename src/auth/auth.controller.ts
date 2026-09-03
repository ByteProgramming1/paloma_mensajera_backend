import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permissions } from '../common/enums/permissions';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
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

  @RequirePermissions(Permissions.USERS_MANAGE_TEMP)
  @Post('temporary-user')
  createTemporaryUser(@Body() dto: CreateTemporaryUserDto) {
    return this.authService.createTemporaryUser(dto);
  }
}
