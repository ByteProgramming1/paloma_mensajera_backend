import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class VerifyMessageDto {
  @IsBoolean()
  approved: boolean;

  // Obligatorio cuando approved = false - validado en el servicio, ya que
  // depende del valor de otro campo (ver seccion 3.3 del SDD).
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
