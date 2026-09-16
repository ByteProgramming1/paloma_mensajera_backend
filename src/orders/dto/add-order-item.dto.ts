import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

// Agregar un producto a un pedido YA CREADO (ej. corregir un olvido del
// vendedor en un pedido ya pagado) - no es el carrito del checkout
// (ver CartItemDto en create-order.dto.ts), es una correccion manual del
// Administrador sobre un pedido existente.
export class AddOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsUUID()
  selectedAddOnOptionId?: string;
}
