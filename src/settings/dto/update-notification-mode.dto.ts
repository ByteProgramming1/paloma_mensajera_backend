import { IsIn } from 'class-validator';
import { NotificationMode } from '../../common/enums/domain.enums';

export class UpdateNotificationModeDto {
  @IsIn(Object.values(NotificationMode))
  notificationMode: NotificationMode;
}
