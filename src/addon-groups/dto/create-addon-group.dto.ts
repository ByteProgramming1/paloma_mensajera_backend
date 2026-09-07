import { IsString, MinLength } from 'class-validator';

export class CreateAddOnGroupDto {
  // Nombre del grupo reutilizable, ej. "Cartas".
  @IsString()
  @MinLength(1)
  name: string;
}
