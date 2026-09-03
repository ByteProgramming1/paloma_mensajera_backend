import { IsString, MinLength } from 'class-validator';

export class ValidateMessageDto {
  @IsString()
  @MinLength(1)
  letterContent: string;
}
