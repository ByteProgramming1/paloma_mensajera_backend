import { IsInt, Min } from 'class-validator';

export class ConfigureRaffleDto {
  @IsInt()
  @Min(1)
  count: number;
}
