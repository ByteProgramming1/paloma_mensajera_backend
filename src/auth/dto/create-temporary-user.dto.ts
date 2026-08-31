import { IsDateString, IsEmail, IsString, MinLength } from 'class-validator';

export class CreateTemporaryUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  roleSlug: string;

  @IsDateString()
  expiresAt: string;
}
