import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permissions } from '../common/enums/permissions';
import { AdminService } from './admin.service';

// "Zona de peligro" del panel admin - endpoints destructivos e irreversibles,
// solo para reutilizar la plataforma en un evento nuevo (ver AdminService).
@Controller('admin/danger')
@RequirePermissions(Permissions.SYSTEM_DANGER_RESET)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('reset-keep-combos')
  @HttpCode(HttpStatus.OK)
  resetKeepCombos() {
    return this.adminService.resetKeepCombos();
  }

  @Post('reset-full')
  @HttpCode(HttpStatus.OK)
  resetFull() {
    return this.adminService.resetFull();
  }
}
