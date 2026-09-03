import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class VerifyPaymentDto {
  @IsBoolean()
  verified: boolean;

  @IsOptional()
  @IsString()
  verificationNotes?: string;
}
