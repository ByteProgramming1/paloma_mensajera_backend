import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

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

  // Reordenamiento manual excepcional (ver AddOnGroup.position): normalmente
  // se asigna solo, pero esto permite corregir el orden de opciones que ya
  // existian antes de que esta columna existiera.
  @IsOptional()
  @IsInt()
  position?: number;
}
