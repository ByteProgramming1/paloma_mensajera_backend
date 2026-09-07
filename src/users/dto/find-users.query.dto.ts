import { IsOptional, IsString } from 'class-validator';

export class FindUsersQueryDto {
  // Lista de slugs de rol separados por coma (ej. "admin,seller"). Sin este
  // filtro, se excluye 'comprador' por defecto - este endpoint es para
  // gestionar staff (rotacion de turnos, selector de encargado de entrega),
  // no para listar compradores.
  @IsOptional()
  @IsString()
  role?: string;
}
