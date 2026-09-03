import { IsIn, IsOptional, IsString } from 'class-validator';
import { DeliveryAssignmentStatus } from '../../common/enums/domain.enums';

export class UpdateDeliveryStatusDto {
  @IsIn(Object.values(DeliveryAssignmentStatus))
  status: DeliveryAssignmentStatus;

  @IsOptional()
  @IsString()
  receivedBy?: string;

  @IsOptional()
  @IsString()
  teamsConfirmationLog?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
