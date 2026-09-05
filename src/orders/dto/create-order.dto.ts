import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BuyerType, SalesChannel } from '../../common/enums/domain.enums';

export class CartItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
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

  // Autorrecogida (seccion 3.1 del SDD): si es true, no se piden datos de un
  // destinatario distinto - el backend copia los del propio comprador (ver
  // OrdersService.createPublicOrder).
  @IsBoolean()
  selfPickup: boolean;

  @ValidateIf((dto: CreateOrderDto) => !dto.selfPickup)
  @IsString()
  @MinLength(2)
  recipientFullName?: string;

  @ValidateIf((dto: CreateOrderDto) => !dto.selfPickup)
  @IsString()
  @MinLength(1)
  recipientCareerOrArea?: string;

  @ValidateIf((dto: CreateOrderDto) => !dto.selfPickup)
  @IsString()
  @MinLength(1)
  recipientTeamsUser?: string;

  // Solo relevante si selfPickup = true: comentario libre para el Vendedor.
  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cartItems: CartItemDto[];

  @IsString()
  @MinLength(1)
  letterContent: string;

  @IsBoolean()
  isAnonymous: boolean;

  @IsIn(Object.values(SalesChannel))
  salesChannel: SalesChannel;
}
