import { IsUUID } from 'class-validator';

export class SelectRaffleNumberDto {
  @IsUUID()
  raffleNumberId: string;
}
