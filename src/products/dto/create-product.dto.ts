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

  // Si es false, el comprador debe recoger este producto el mismo en el
  // stand: no se puede enviar a otra persona (ver Product.giftable).
  @IsOptional()
  @IsBoolean()
  giftable?: boolean;

  // Normalmente se completa via POST /products/:id/image (ver seccion 9 del
  // SDD); se deja como string simple (no @IsUrl) para admitir tanto rutas
  // relativas de /uploads local como URLs completas de un bucket externo.
  @IsOptional()
  @IsString()
  imageUrl?: string;

  // Reordenamiento manual excepcional (ver Product.position): normalmente se
  // asigna solo al crear, pero esto permite corregir el orden de productos
  // que ya existian antes de que esta columna existiera.
  @IsOptional()
  @IsInt()
  position?: number;
}
