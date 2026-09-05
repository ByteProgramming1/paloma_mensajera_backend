import { IsIn, IsOptional, IsString } from 'class-validator';

export class FindOrdersQueryDto {
  // 'payment' ya no existe: el Administrador usa la vista completa (orders:read_all)
  // porque no hay ninguna restriccion de campos que aplicarle (ver seccion 6 del SDD).
  @IsOptional()
  @IsIn(['message'])
  view?: 'message';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
