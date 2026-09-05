import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
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

  // Normalmente se completa via POST /products/:id/image (ver seccion 9 del
  // SDD); se deja como string simple (no @IsUrl) para admitir tanto rutas
  // relativas de /uploads local como URLs completas de un bucket externo.
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
