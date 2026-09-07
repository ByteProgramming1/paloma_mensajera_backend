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
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/enums/permissions';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { OrdersService } from './orders.service';
import { TeamsNotificationService } from '../notifications/teams-notification.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyMessageDto } from './dto/verify-message.dto';
import { SelectRaffleNumberDto } from './dto/select-raffle-number.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { FindOrdersQueryDto } from './dto/find-orders.query.dto';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly teamsNotificationService: TeamsNotificationService,
  ) {}

  // No existe POST /orders/validate-message: la dedicatoria ya no pasa por
  // ningun filtro automatico (seccion 2 del SDD vigente), solo por revision
  // manual del Vendedor via PATCH /orders/:id/verify-message.
  @RequirePermissions(Permissions.ORDERS_CREATE_PUBLIC)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('public')
  createPublicOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createPublicOrder(dto);
  }

  // A pesar del nombre (se conserva la ruta para no romper el frontend), ya
  // no filtra por vendedor asignado: cualquier cuenta con este permiso ve
  // TODAS las entregas pendientes, sin asignacion previa del Administrador
  // (ver OrdersService.findMyDeliveries).
  @RequirePermissions(Permissions.ORDERS_READ_PUBLIC_SAFE)
  @Get('my-deliveries')
  findMyDeliveries() {
    return this.ordersService.findMyDeliveries();
  }

  @Get()
  findOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: FindOrdersQueryDto) {
    if (query.view === 'message') {
      this.assertPermission(user, Permissions.MESSAGES_READ_QUEUE);
      return this.ordersService.findMessageQueue(query.search);
    }

    if (query.recipientName) {
      this.assertAnyPermission(user, [
        Permissions.ORDERS_READ_ALL,
        Permissions.ORDERS_READ_PUBLIC_SAFE,
      ]);
      return this.ordersService.findByRecipientName(query.recipientName);
    }

    // El Administrador siempre usa la vista completa: no hay una vista
    // restringida de pagos separada (ver seccion 6 del SDD vigente).
    if (user.permissions.includes(Permissions.ORDERS_READ_ALL)) {
      return this.ordersService.findAllFull();
    }
    this.assertPermission(user, Permissions.ORDERS_READ_PUBLIC_SAFE);
    return this.ordersService.findAllSafe();
  }

  // El comprador consulta su propio pedido (orders:read_own) para saber si la
  // dedicatoria ya fue aprobada/rechazada o si tiene numero de rifa, incluso
  // despues de cerrar la pestana - ver OrdersService.findOneForUser. Admin y
  // Vendedor tambien pueden usarla (misma logica de vista que GET /orders).
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertAnyPermission(user, [
      Permissions.ORDERS_READ_OWN,
      Permissions.ORDERS_READ_ALL,
      Permissions.ORDERS_READ_PUBLIC_SAFE,
    ]);
    return this.ordersService.findOneForUser(id, user);
  }

  @RequirePermissions(Permissions.MESSAGES_VERIFY)
  @Patch(':id/verify-message')
  verifyMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyMessageDto,
  ) {
    return this.ordersService.verifyMessage(id, user.userId, dto);
  }

  @RequirePermissions(Permissions.RAFFLE_SELECT_NUMBER)
  @Post(':id/select-raffle-number')
  selectRaffleNumber(@Param('id') id: string, @Body() dto: SelectRaffleNumberDto) {
    return this.ordersService.selectRaffleNumber(id, dto);
  }

  @RequirePermissions(Permissions.ORDERS_VERIFY_PAYMENT)
  @Patch(':id/verify-payment')
  verifyPayment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.ordersService.verifyPayment(id, user, dto);
  }

  // Cualquier vendedor puede tomar y marcar cualquier entrega pendiente, sin
  // asignacion previa del Administrador (ver OrdersService.updateDeliveryStatus):
  // "tomar" una entrega es simplemente ser quien marca el primer cambio de
  // estado, no una accion aparte.
  @RequirePermissions(Permissions.ORDERS_UPDATE_DELIVERY)
  @Patch(':id/delivery-status')
  updateDeliveryStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.ordersService.updateDeliveryStatus(id, user.userId, dto);
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
