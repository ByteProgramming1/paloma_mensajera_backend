import { Body, Controller, Patch } from '@nestjs/common';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { SettingsService } from './settings.service';
import { UpdateNotificationModeDto } from './dto/update-notification-mode.dto';

@Controller('settings')
@AdminOnly()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Patch('notification-mode')
  updateNotificationMode(@Body() dto: UpdateNotificationModeDto) {
    return this.settingsService.updateNotificationMode(dto.notificationMode);
  }
}
