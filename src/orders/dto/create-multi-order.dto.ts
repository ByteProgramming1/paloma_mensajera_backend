import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BuyerType, SalesChannel } from '../../common/enums/domain.enums';
import { CartItemDto } from './create-order.dto';

// Un destinatario del checkout multi-destinatario (ver POST /orders/public/multi):
// mismos campos que CreateOrderDto salvo los del comprador, que se declaran
// una sola vez a nivel de CreateMultiOrderDto porque son compartidos por
// todo el grupo.
export class CreateOrderRecipientDto {
  @IsBoolean()
  selfPickup: boolean;

  @ValidateIf((dto: CreateOrderRecipientDto) => !dto.selfPickup)
  @IsString()
  @MinLength(2)
  recipientFullName?: string;

  @ValidateIf((dto: CreateOrderRecipientDto) => !dto.selfPickup)
  @IsString()
  @MinLength(1)
  recipientCareerOrArea?: string;

  @ValidateIf((dto: CreateOrderRecipientDto) => !dto.selfPickup)
  @IsString()
  @MinLength(1)
  recipientTeamsUser?: string;

  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cartItems: CartItemDto[];

  @IsOptional()
  @IsString()
  letterContent?: string;

  @IsBoolean()
  isAnonymous: boolean;
}

// Un solo checkout que crea un pedido por cada destinatario (ver seccion
// "compra multi-destinatario"): comprador y canal de venta son compartidos,
// cada elemento de `recipients` se convierte en su propio Order con dedicatoria,
// revision de mensaje y entrega 100% independientes - solo el pago se
// verifica en conjunto (ver Order.groupId y PATCH /orders/groups/:groupId/verify-payment).
export class CreateMultiOrderDto {
  @IsString()
  @MinLength(2)
  buyerFullName: string;

  @IsEmail()
  buyerEmail: string;

  @IsString()
  @MinLength(5)
  buyerPhone: string;

  @IsIn(Object.values(BuyerType))
  buyerType: BuyerType;

  @IsString()
  @MinLength(1)
  buyerCareerOrArea: string;

  @IsOptional()
  @IsUUID()
  assistedBySellerId?: string;

  @IsIn(Object.values(SalesChannel))
  salesChannel: SalesChannel;

  // Minimo 2: con un solo destinatario se usa POST /orders/public, sin
  // concepto de grupo.
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderRecipientDto)
  recipients: CreateOrderRecipientDto[];
}
