import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ResubmitMessageDto {
  @IsOptional()
  @IsString()
  letterContent?: string;

  @IsBoolean()
  isAnonymous: boolean;
}
