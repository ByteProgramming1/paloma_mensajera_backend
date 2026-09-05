import { Body, Controller, Param, Patch } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/enums/permissions';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UsersService } from './users.service';
import { ReassignRoleDto } from './dto/reassign-role.dto';
import { ToggleUserStatusDto } from './dto/toggle-user-status.dto';

@Controller('users')
@RequirePermissions(Permissions.USERS_MANAGE_ROLES)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch(':id/role')
  reassignRole(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ReassignRoleDto,
  ) {
    return this.usersService.reassignRole(admin.userId, id, dto);
  }

  @Patch(':id/status')
  toggleStatus(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ToggleUserStatusDto,
  ) {
    return this.usersService.toggleStatus(admin.userId, id, dto);
  }
}
