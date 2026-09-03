import { IsOptional, IsString, MinLength } from 'class-validator';

export class DrawRoundDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  drawBatchId?: string;
}
