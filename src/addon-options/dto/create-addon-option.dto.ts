import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAddOnOptionDto {
  @IsUUID()
  groupId: string;

  @IsString()
  @MinLength(1)
  name: string;

  // Si esta opcion en realidad es un producto vendible por separado (ej. la
  // paleta), el id de ese Product - ver AddOnOption.linkedProductId. El stock
  // se descuenta de ahi, sea que se venda sola o como acompañante.
  @IsOptional()
  @IsUUID()
  linkedProductId?: string;
}
