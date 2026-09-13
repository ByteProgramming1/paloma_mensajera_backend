import { IsBoolean, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

export class UpdateAddOnOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Omitido = no cambia; null = desvincula (opcion vuelve a ser puramente
  // decorativa); un uuid = enlaza/reemplaza el producto vendible asociado.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  linkedProductId?: string | null;
}
