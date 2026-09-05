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
  ValidateNested,
} from 'class-validator';
import { SalesChannel } from '../../common/enums/domain.enums';

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
  buyerName: string;

  @IsEmail()
  buyerEmail: string;

  @IsString()
  @MinLength(5)
  buyerPhone: string;

  @IsOptional()
  @IsUUID()
  assistedBySellerId?: string;

  @IsString()
  @MinLength(2)
  recipientName: string;

  @IsString()
  @MinLength(1)
  recipientTeamsUser: string;

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
