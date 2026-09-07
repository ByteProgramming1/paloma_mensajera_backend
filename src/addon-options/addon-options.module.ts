import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AddOnOptionsController } from './addon-options.controller';
import { AddOnOptionsService } from './addon-options.service';

@Module({
  imports: [StorageModule],
  controllers: [AddOnOptionsController],
  providers: [AddOnOptionsService],
})
export class AddOnOptionsModule {}
