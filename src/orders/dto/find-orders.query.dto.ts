import { IsIn, IsOptional, IsString } from 'class-validator';

export class FindOrdersQueryDto {
  @IsOptional()
  @IsIn(['payment', 'message'])
  view?: 'payment' | 'message';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
