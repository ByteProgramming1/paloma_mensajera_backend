import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { GraphClientService } from './graph-client.service';
import { TeamsNotificationService } from './teams-notification.service';

@Module({
  imports: [SettingsModule],
  providers: [GraphClientService, TeamsNotificationService],
  exports: [TeamsNotificationService],
})
export class NotificationsModule {}
