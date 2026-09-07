import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAddOnOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
