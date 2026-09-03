import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/enums/permissions';
import { RoleSlug } from '../common/enums/domain.enums';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { RaffleNumbersService } from './raffle-numbers.service';
import { DrawRoundDto } from './dto/draw-round.dto';

@Controller('raffle-numbers')
export class RaffleNumbersController {
  constructor(private readonly raffleNumbersService: RaffleNumbersService) {}

  @RequirePermissions(Permissions.RAFFLE_SELECT_NUMBER)
  @Get()
  findMap() {
    return this.raffleNumbersService.findMap();
  }

  @RequirePermissions(Permissions.RAFFLE_DRAW_WINNER)
  @Get('eligible-for-draw')
  findEligibleForDraw() {
    return this.raffleNumbersService.findEligibleForDraw();
  }

  @RequirePermissions(Permissions.RAFFLE_DRAW_WINNER)
  @Post('draw')
  draw(@CurrentUser() user: AuthenticatedUser, @Body() dto: DrawRoundDto) {
    return this.raffleNumbersService.draw(
      user.userId,
      user.roleSlug === RoleSlug.ADMIN,
      dto.drawBatchId,
    );
  }

  @RequirePermissions(Permissions.RAFFLE_DRAW_WINNER)
  @Get('draw-history')
  drawHistory() {
    return this.raffleNumbersService.drawHistory();
  }
}
