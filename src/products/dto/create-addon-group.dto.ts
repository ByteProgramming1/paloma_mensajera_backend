import { IsString, MinLength } from 'class-validator';

export class CreateAddOnGroupDto {
  // Nombre del grupo tal como se muestra al comprador, ej. "Elige tu carta".
  @IsString()
  @MinLength(1)
  name: string;
}
