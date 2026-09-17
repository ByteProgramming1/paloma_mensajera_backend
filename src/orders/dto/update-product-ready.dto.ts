import { IsBoolean } from 'class-validator';

export class UpdateProductReadyDto {
  @IsBoolean()
  productReady: boolean;
}
