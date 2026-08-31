import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ProductType } from '../../common/enums/domain.enums';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsIn(Object.values(ProductType))
  type: ProductType;

  @IsNumber()
  @Min(0)
  price: number;

  @IsInt()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
