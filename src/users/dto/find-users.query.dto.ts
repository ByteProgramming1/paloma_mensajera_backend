import { IsOptional, IsString } from 'class-validator';

export class FindUsersQueryDto {
  // Lista de slugs de rol separados por coma (ej. "admin,seller"). Sin este
  // filtro, se listan todas las cuentas de la plataforma.
  @IsOptional()
  @IsString()
  role?: string;
}
