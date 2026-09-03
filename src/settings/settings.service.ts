import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationMode } from '../common/enums/domain.enums';

const SETTINGS_ID = 'singleton';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotificationMode(): Promise<NotificationMode> {
    const settings = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    return settings.notificationMode as NotificationMode;
  }

  async updateNotificationMode(notificationMode: NotificationMode) {
    return this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { notificationMode },
      create: { id: SETTINGS_ID, notificationMode },
    });
  }
}
