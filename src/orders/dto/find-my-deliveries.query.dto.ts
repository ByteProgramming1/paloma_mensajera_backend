import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class FindMyDeliveriesQueryDto {
  // Por defecto solo trae pedidos aun pendientes de entrega. En true, incluye
  // tambien los ya DELIVERED (ej. el toggle "ver todas" del Vendedor).
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDelivered?: boolean;
}
