import { Module } from '@nestjs/common';
import { RaffleNumbersController } from './raffle-numbers.controller';
import { RaffleNumbersService } from './raffle-numbers.service';

@Module({
  controllers: [RaffleNumbersController],
  providers: [RaffleNumbersService],
  exports: [RaffleNumbersService],
})
export class RaffleNumbersModule {}
