import { IsDateString, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTemporaryUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  // Opcional: si se omite, la cuenta solo puede iniciar sesion con Microsoft
  // Entra ID (SSO institucional) - ver AuthService.loginWithMicrosoft.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsString()
  roleSlug: string;

  @IsDateString()
  expiresAt: string;
}
