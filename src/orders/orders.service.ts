import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyMessageDto } from './dto/verify-message.dto';
import { SelectRaffleNumberDto } from './dto/select-raffle-number.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { buildOrderCode } from './order-code.util';
import {
  DeliveryAssignmentStatus,
  HumanReviewStatus,
  OrderStatus,
  PaymentMethod,
  RaffleNumberStatus,
  RoleSlug,
} from '../common/enums/domain.enums';
import {
  ORDER_WITH_RELATIONS,
  serializeOrderFull,
  serializeOrderMessageView,
  serializeOrderSafe,
} from './orders.serializer';

interface ActingUser {
  userId: string;
  roleSlug: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
  ) {}

  // Crea el pedido directo en MESSAGE_PENDING_REVIEW - sin ningun filtro
  // automatico ni IA (seccion 2 y 8.1 del SDD vigente): toda dedicatoria pasa
  // por revision 100% manual del Vendedor. No se toca stock ni rifa todavia.
  async createPublicOrder(dto: CreateOrderDto) {
    const orderSequence = (await this.prisma.order.count()) + 1;

    // Autorrecogida (seccion 3.1): si el comprador recoge su propio regalo,
    // no existen datos de un destinatario distinto - se copian los suyos. El
    // formulario no pide un "usuario de Teams" aparte para el comprador (solo
    // existe para el destinatario en 3.1), asi que se usa su correo
    // institucional: en Microsoft Teams/365 el UPN (correo) es el identificador
    // de usuario, por lo que sirve igual para notificarlo por Teams.
    const recipientData = dto.selfPickup
      ? {
          recipientFullName: dto.buyerFullName,
          recipientCareerOrArea: dto.buyerCareerOrArea,
          recipientTeamsUser: dto.buyerEmail,
        }
      : {
          recipientFullName: dto.recipientFullName!,
          recipientCareerOrArea: dto.recipientCareerOrArea,
          recipientTeamsUser: dto.recipientTeamsUser!,
        };

    return this.prisma.order.create({
      data: {
        orderCode: buildOrderCode(orderSequence),
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
        salesChannel: dto.salesChannel,
        assistedBySellerId: dto.assistedBySellerId ?? null,
        deliveryDetail: {
          create: {
            buyerFullName: dto.buyerFullName,
            buyerEmail: dto.buyerEmail,
            buyerPhone: dto.buyerPhone,
            buyerType: dto.buyerType,
            buyerCareerOrArea: dto.buyerCareerOrArea,
            selfPickup: dto.selfPickup,
            deliveryNotes: dto.selfPickup ? (dto.deliveryNotes ?? null) : null,
            letterContent: dto.letterContent,
            isAnonymous: dto.isAnonymous,
            ...recipientData,
          },
        },
        items: {
          create: dto.cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
        messageReview: {
          create: { humanReviewStatus: HumanReviewStatus.PENDING },
        },
      },
    });
  }

  // Revision manual de la dedicatoria - normalmente el Vendedor, quien puede
  // buscar al comprador por nombre en la cola (ver findMessageQueue). Unico
  // gate que habilita el mapa de rifa (seccion 3.2 y HU-03 del SDD vigente).
  async verifyMessage(orderId: string, reviewerId: string, dto: VerifyMessageDto) {
    const order = await this.findOrderOrThrow(orderId);
    if (
      order.status !== OrderStatus.MESSAGE_PENDING_REVIEW &&
      order.status !== OrderStatus.MESSAGE_REJECTED
    ) {
      throw new BadRequestException('Este pedido no tiene una dedicatoria pendiente de revision.');
    }
    if (!dto.approved && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason es obligatorio cuando approved es false.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: dto.approved ? OrderStatus.MESSAGE_APPROVED : OrderStatus.MESSAGE_REJECTED,
        },
      });

      return tx.messageReview.update({
        where: { orderId },
        data: {
          humanReviewStatus: dto.approved ? HumanReviewStatus.APPROVED : HumanReviewStatus.REJECTED,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: dto.approved ? null : dto.rejectionReason,
        },
      });
    });
  }

  // Solo con MESSAGE_APPROVED - descuenta stock del carrito, asigna el numero
  // de rifa de forma atomica y crea el pago pendiente (seccion 10.2 del SDD).
  async selectRaffleNumber(orderId: string, dto: SelectRaffleNumberDto) {
    const order = await this.findOrderOrThrow(orderId);
    if (order.status !== OrderStatus.MESSAGE_APPROVED) {
      throw new BadRequestException(
        'Este pedido aun no tiene la dedicatoria aprobada por el Vendedor.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({ where: { orderId } });

      let totalAmount = 0;
      for (const item of items) {
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
        await tx.orderItem.update({
          where: { id: item.id },
          data: { unitPrice: product.price },
        });
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
      await tx.raffleNumber.update({
        where: { id: dto.raffleNumberId },
        data: { orderId },
      });

      await tx.paymentTransaction.create({
        data: { orderId, paymentMethod: PaymentMethod.NEQUI, verified: false },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAYMENT_PENDING, totalAmount },
      });
    });
  }

  // Confirma/rechaza el pago. Tarea EXCLUSIVA del Administrador, sin ningun
  // alcance para el Vendedor (seccion 3.3, 11.2 y HU-05 del SDD vigente): el
  // guard de permisos ya bloquea a cualquier otro rol, y este chequeo explicito
  // es defensa adicional para que nunca dependa solo de como quede la matriz.
  async verifyPayment(orderId: string, actingUser: ActingUser, dto: VerifyPaymentDto) {
    if (actingUser.roleSlug !== RoleSlug.ADMIN) {
      throw new ForbiddenException('Solo el Administrador puede confirmar o rechazar un pago.');
    }

    const order = await this.findOrderOrThrow(orderId);
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new BadRequestException('Este pedido ya fue verificado.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.verified) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PAYMENT_VERIFIED },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PAYMENT_REJECTED },
        });
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
          verifiedByAdminId: actingUser.userId,
          verifiedAt: new Date(),
          verificationNotes: dto.verificationNotes,
        },
      });
    });
  }

  async assignDelivery(orderId: string, dto: AssignDeliveryDto) {
    const order = await this.findOrderOrThrow(orderId);
    if (order.status !== OrderStatus.PAYMENT_VERIFIED) {
      throw new BadRequestException(
        'Solo se puede asignar un encargado a pedidos con pago verificado.',
      );
    }

    const deliveryPerson = await this.prisma.user.findUnique({
      where: { id: dto.deliveryPersonId },
      include: { role: true },
    });
    if (
      !deliveryPerson ||
      ![RoleSlug.SELLER, RoleSlug.DELIVERY].includes(deliveryPerson.role.slug as RoleSlug)
    ) {
      throw new BadRequestException(
        'El responsable de entrega debe ser un usuario con rol Vendedor.',
      );
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

    const { updatedAssignment, deliveryDetail } = await this.prisma.$transaction(async (tx) => {
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

      const deliveryDetail = isDelivered
        ? await tx.deliveryDetail.findUnique({ where: { orderId } })
        : null;

      return { updatedAssignment, deliveryDetail };
    });

    // Notificacion al comprador (seccion "entrega" del SDD): se envia fuera de
    // la transaccion (I/O externo) y no bloquea la confirmacion de entrega si
    // el correo falla - ver MailerService.sendDeliveryConfirmation.
    if (deliveryDetail) {
      await this.mailerService.sendDeliveryConfirmation(
        deliveryDetail.buyerEmail,
        deliveryDetail.buyerFullName,
      );
    }

    return updatedAssignment;
  }

  async findAllFull() {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(serializeOrderFull);
  }

  async findAllSafe() {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(serializeOrderSafe);
  }

  // Cola de dedicatorias pendientes para el Vendedor - puede buscar por el
  // nombre del comprador para ubicar un pedido puntual (seccion 3.2 del SDD).
  async findMessageQueue(search?: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      where: {
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
        ...(search ? { deliveryDetail: { buyerFullName: { contains: search } } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return orders.map(serializeOrderMessageView);
  }

  async findByRecipientName(recipientName: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      where: { deliveryDetail: { recipientFullName: { contains: recipientName } } },
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
