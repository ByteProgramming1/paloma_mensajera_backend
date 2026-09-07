import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAddOnOptionDto {
  @IsUUID()
  groupId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
