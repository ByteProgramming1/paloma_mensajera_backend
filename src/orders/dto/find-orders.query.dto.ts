import { IsIn, IsOptional, IsString } from 'class-validator';

export class FindOrdersQueryDto {
  @IsOptional()
  @IsIn(['payment'])
  view?: 'payment';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
