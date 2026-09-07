import { Module } from '@nestjs/common';
import { AddOnGroupsController } from './addon-groups.controller';
import { AddOnGroupsService } from './addon-groups.service';

@Module({
  controllers: [AddOnGroupsController],
  providers: [AddOnGroupsService],
})
export class AddOnGroupsModule {}
