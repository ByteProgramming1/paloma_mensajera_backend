import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ValidateMessageDto } from './dto/validate-message.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { buildOrderCode } from './order-code.util';
import {
  DeliveryAssignmentStatus,
  OrderStatus,
  PaymentMethod,
  RaffleNumberStatus,
} from '../common/enums/domain.enums';
import {
  ORDER_WITH_RELATIONS,
  serializeOrderFull,
  serializeOrderPaymentView,
  serializeOrderSafe,
} from './orders.serializer';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderationService: ModerationService,
  ) {}

  validateMessage(dto: ValidateMessageDto) {
    return this.moderationService.moderateMessage(dto.letterContent);
  }

  async createPublicOrder(dto: CreateOrderDto) {
    // Revalidacion defensiva de la dedicatoria (el frontend ya la valido antes de
    // mostrar el mapa de rifa) - seccion 3.2 y 7.3 del SDD.
    const moderation = await this.moderationService.moderateMessage(dto.letterContent);
    if (!moderation.approved) {
      throw new BadRequestException(moderation.reason ?? 'El mensaje no pudo ser aprobado.');
    }

    return this.prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const unitPricesByProductId = new Map<string, number>();
      for (const item of dto.cartItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || !product.isActive || product.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para '${product?.name ?? item.productId}'.`,
          );
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
        unitPricesByProductId.set(item.productId, product.price);
        totalAmount += product.price * item.quantity;
      }

      // Asignacion atomica del numero de rifa, sin estado HELD ni expiracion por tiempo.
      const raffleUpdate = await tx.raffleNumber.updateMany({
        where: { id: dto.raffleNumberId, status: RaffleNumberStatus.AVAILABLE },
        data: { status: RaffleNumberStatus.ASSIGNED },
      });
      if (raffleUpdate.count === 0) {
        throw new ConflictException('Ese numero de rifa ya fue tomado. Por favor elige otro.');
      }

      const orderSequence = (await tx.order.count()) + 1;

      const order = await tx.order.create({
        data: {
          orderCode: buildOrderCode(orderSequence),
          status: OrderStatus.PAYMENT_PENDING,
          totalAmount,
          salesChannel: dto.salesChannel,
          assistedBySellerId: dto.assistedBySellerId ?? null,
          deliveryDetail: {
            create: {
              buyerName: dto.buyerName,
              buyerEmail: dto.buyerEmail,
              buyerPhone: dto.buyerPhone,
              recipientName: dto.recipientName,
              recipientTeamsUser: dto.recipientTeamsUser,
              letterContent: dto.letterContent,
              isAnonymous: dto.isAnonymous,
              contentModerationMethod: moderation.method,
            },
          },
          items: {
            create: dto.cartItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: unitPricesByProductId.get(item.productId)!,
            })),
          },
          paymentTransaction: {
            create: { paymentMethod: PaymentMethod.NEQUI, verified: false },
          },
        },
      });

      await tx.raffleNumber.update({
        where: { id: dto.raffleNumberId },
        data: { orderId: order.id },
      });

      return order;
    });
  }

  async verifyPayment(orderId: string, verifierId: string, dto: VerifyPaymentDto) {
    const order = await this.findOrderOrThrow(orderId);
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new BadRequestException('Este pedido ya fue verificado.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.verified) {
        await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAYMENT_VERIFIED } });
      } else {
        await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAYMENT_REJECTED } });
        await tx.raffleNumber.updateMany({
          where: { orderId },
          data: { status: RaffleNumberStatus.AVAILABLE, orderId: null },
        });
        const items = await tx.orderItem.findMany({ where: { orderId } });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return tx.paymentTransaction.update({
        where: { orderId },
        data: {
          verified: dto.verified,
          verifiedByUserId: verifierId,
          verifiedAt: new Date(),
          verificationNotes: dto.verificationNotes,
        },
      });
    });
  }

  async assignDelivery(orderId: string, dto: AssignDeliveryDto) {
    const order = await this.findOrderOrThrow(orderId);
    if (order.status !== OrderStatus.PAYMENT_VERIFIED) {
      throw new BadRequestException('Solo se puede asignar un encargado a pedidos con pago verificado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.create({
        data: { orderId, deliveryPersonId: dto.deliveryPersonId },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.IN_ROUTE } });
      return assignment;
    });
  }

  async updateDeliveryStatus(orderId: string, dto: UpdateDeliveryStatusDto) {
    await this.findOrderOrThrow(orderId);

    const assignment = await this.prisma.deliveryAssignment.findFirst({
      where: { orderId },
      orderBy: { assignedAt: 'desc' },
    });
    if (!assignment) {
      throw new BadRequestException('Este pedido no tiene un encargado asignado.');
    }

    const isDelivered = dto.status === DeliveryAssignmentStatus.DELIVERED;
    if (isDelivered && !dto.receivedBy) {
      throw new BadRequestException('receivedBy es obligatorio para confirmar la entrega.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedAssignment = await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: {
          status: dto.status,
          receivedBy: dto.receivedBy,
          teamsConfirmationLog: dto.teamsConfirmationLog,
          notes: dto.notes,
          deliveredAt: isDelivered ? new Date() : undefined,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: this.mapDeliveryStatusToOrderStatus(dto.status) },
      });

      return updatedAssignment;
    });
  }

  async findAllFull() {
    const orders = await this.prisma.order.findMany({ ...ORDER_WITH_RELATIONS, orderBy: { createdAt: 'desc' } });
    return orders.map(serializeOrderFull);
  }

  async findAllSafe() {
    const orders = await this.prisma.order.findMany({ ...ORDER_WITH_RELATIONS, orderBy: { createdAt: 'desc' } });
    return orders.map(serializeOrderSafe);
  }

  async findPaymentView(search?: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      where: {
        status: OrderStatus.PAYMENT_PENDING,
        ...(search
          ? { deliveryDetail: { buyerName: { contains: search } } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return orders.map(serializeOrderPaymentView);
  }

  async findByRecipientName(recipientName: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      where: { deliveryDetail: { recipientName: { contains: recipientName } } },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(serializeOrderSafe);
  }

  async findMyDeliveries(deliveryPersonId: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      where: { deliveryAssignments: { some: { deliveryPersonId } } },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(serializeOrderSafe);
  }

  private mapDeliveryStatusToOrderStatus(status: DeliveryAssignmentStatus): OrderStatus {
    switch (status) {
      case DeliveryAssignmentStatus.DELIVERED:
        return OrderStatus.DELIVERED;
      case DeliveryAssignmentStatus.CANCELLED:
        return OrderStatus.CANCELLED;
      case DeliveryAssignmentStatus.IN_ROUTE:
      case DeliveryAssignmentStatus.UNDELIVERED_RETRY:
      default:
        return OrderStatus.IN_ROUTE;
    }
  }

  private async findOrderOrThrow(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException(`Pedido '${orderId}' no encontrado.`);
    }
    return order;
  }
}
