import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/enums/permissions';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { OrdersService } from './orders.service';
import { TeamsNotificationService } from '../notifications/teams-notification.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ValidateMessageDto } from './dto/validate-message.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { FindOrdersQueryDto } from './dto/find-orders.query.dto';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly teamsNotificationService: TeamsNotificationService,
  ) {}

  @Public()
  @Post('validate-message')
  validateMessage(@Body() dto: ValidateMessageDto) {
    return this.ordersService.validateMessage(dto);
  }

  @RequirePermissions(Permissions.ORDERS_CREATE_PUBLIC)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('public')
  createPublicOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createPublicOrder(dto);
  }

  @RequirePermissions(Permissions.ORDERS_READ_PUBLIC_SAFE)
  @Get('my-deliveries')
  findMyDeliveries(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findMyDeliveries(user.userId);
  }

  @Get()
  findOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: FindOrdersQueryDto) {
    if (query.view === 'payment') {
      this.assertPermission(user, Permissions.ORDERS_READ_PAYMENT_INFO);
      return this.ordersService.findPaymentView(query.search);
    }

    if (query.recipientName) {
      this.assertAnyPermission(user, [
        Permissions.ORDERS_READ_ALL,
        Permissions.ORDERS_READ_PUBLIC_SAFE,
      ]);
      return this.ordersService.findByRecipientName(query.recipientName);
    }

    if (user.permissions.includes(Permissions.ORDERS_READ_ALL)) {
      return this.ordersService.findAllFull();
    }
    this.assertPermission(user, Permissions.ORDERS_READ_PUBLIC_SAFE);
    return this.ordersService.findAllSafe();
  }

  @RequirePermissions(Permissions.ORDERS_VERIFY_PAYMENT)
  @Patch(':id/verify-payment')
  verifyPayment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.ordersService.verifyPayment(id, user.userId, dto);
  }

  @RequirePermissions(Permissions.ORDERS_ASSIGN_DELIVERY)
  @Patch(':id/assign-delivery')
  assignDelivery(@Param('id') id: string, @Body() dto: AssignDeliveryDto) {
    return this.ordersService.assignDelivery(id, dto);
  }

  @RequirePermissions(Permissions.ORDERS_UPDATE_DELIVERY)
  @Patch(':id/delivery-status')
  updateDeliveryStatus(@Param('id') id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return this.ordersService.updateDeliveryStatus(id, dto);
  }

  @RequirePermissions(Permissions.ORDERS_UPDATE_DELIVERY)
  @Post(':id/notify-teams')
  notifyTeams(@Param('id') id: string) {
    return this.teamsNotificationService.notify(id);
  }

  private assertPermission(user: AuthenticatedUser, permission: Permissions) {
    if (!user.permissions.includes(permission)) {
      throw new ForbiddenException('No tiene permisos suficientes para esta accion.');
    }
  }

  private assertAnyPermission(user: AuthenticatedUser, permissions: Permissions[]) {
    if (!permissions.some((permission) => user.permissions.includes(permission))) {
      throw new ForbiddenException('No tiene permisos suficientes para esta accion.');
    }
  }
}
