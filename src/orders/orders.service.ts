import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../prisma/postgresql/generated';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { Permissions } from '../common/enums/permissions';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CartItemDto, CreateOrderDto } from './dto/create-order.dto';
import { VerifyMessageDto } from './dto/verify-message.dto';
import { SelectRaffleNumberDto } from './dto/select-raffle-number.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { buildOrderCode } from './order-code.util';
import {
  DeliveryAssignmentStatus,
  HumanReviewStatus,
  OrderStatus,
  PaymentMethod,
  RaffleNumberStatus,
  RoleSlug,
  SalesChannel,
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
  // Excepcion: si no hay dedicatoria (letterContent opcional, ver
  // CreateOrderDto), no hay nada que un Vendedor pueda revisar - el pedido
  // arranca directo en MESSAGE_APPROVED, sin pasar por la cola de mensajes.
  async createPublicOrder(dto: CreateOrderDto) {
    await this.assertValidAddOnSelections(dto.cartItems);
    await this.assertGiftableIfNotSelfPickup(dto);
    const orderSequence = (await this.prisma.order.count()) + 1;
    const hasLetterContent = !!dto.letterContent?.trim();

    // Snapshot del precio vigente al armar el carrito (seccion 10.2 del SDD):
    // el comprador ya conoce el precio desde este momento, no hace falta
    // esperar a selectRaffleNumber para mostrarle un total real - eso queda
    // solo para el descuento de stock, que si se difiere hasta que la
    // dedicatoria este aprobada.
    const unitPrices = await this.resolveUnitPrices(dto.cartItems);
    const totalAmount = dto.cartItems.reduce(
      (sum, item) => sum + unitPrices.get(item.productId)! * item.quantity,
      0,
    );

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
        status: hasLetterContent
          ? OrderStatus.MESSAGE_PENDING_REVIEW
          : OrderStatus.MESSAGE_APPROVED,
        totalAmount,
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
            letterContent: dto.letterContent ?? '',
            isAnonymous: dto.isAnonymous,
            ...recipientData,
          },
        },
        items: {
          create: dto.cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: unitPrices.get(item.productId)!,
            selectedAddOnOptionId: item.selectedAddOnOptionId ?? null,
          })),
        },
        // Sin dedicatoria, se marca como aprobado de una vez (sin revisor
        // humano) para que las pantallas que leen messageReview.humanReviewStatus
        // (ej. admin/orders-page) no muestren un pedido MESSAGE_APPROVED con
        // un estado PENDING inconsistente.
        messageReview: {
          create: hasLetterContent
            ? { humanReviewStatus: HumanReviewStatus.PENDING }
            : { humanReviewStatus: HumanReviewStatus.APPROVED, reviewedAt: new Date() },
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

    const messageReview = await this.prisma.$transaction(async (tx) => {
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

    // Notificacion al comprador solo si la compra fue ONLINE (si fue
    // PRESENCIAL, el Vendedor ya se lo dice en persona) - se envia fuera de
    // la transaccion y no bloquea la revision si el correo falla, igual que
    // updateDeliveryStatus con sendDeliveryConfirmation.
    if (dto.approved && order.salesChannel === SalesChannel.ONLINE && order.deliveryDetail) {
      await this.mailerService.sendMessageApprovedConfirmation(
        order.deliveryDetail.buyerEmail,
        order.deliveryDetail.buyerFullName,
      );
    }

    return messageReview;
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
      const items = await tx.orderItem.findMany({
        where: { orderId },
        include: { selectedAddOnOption: true },
      });

      // El precio (unitPrice/totalAmount del pedido) ya quedo fijado como
      // snapshot en createPublicOrder - aca solo se valida disponibilidad y
      // se descuenta stock, sin volver a tocar el precio.
      for (const item of items) {
        await this.decrementProductStock(tx, item.productId, item.quantity);

        // El acompañante elegido puede ser en realidad un producto vendible
        // por separado (ej. la paleta) - ver AddOnOption.linkedProductId. El
        // stock compartido se descuenta igual, sea que se venda solo o venga
        // embebido en un combo.
        const linkedProductId = item.selectedAddOnOption?.linkedProductId;
        if (linkedProductId) {
          await this.decrementProductStock(tx, linkedProductId, item.quantity);
        }
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

      // Metodo de pago segun el canal de venta (seccion "pago fisico en stand
      // vs digital"): PRESENCIAL es efectivo en el stand, ONLINE es Nequi/Bre-B.
      const paymentMethod =
        order.salesChannel === SalesChannel.PRESENCIAL ? PaymentMethod.CASH : PaymentMethod.NEQUI;
      await tx.paymentTransaction.create({
        data: { orderId, paymentMethod, verified: false },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAYMENT_PENDING },
      });
    });
  }

  // Confirma/rechaza el pago. Quien puede hacerlo depende del canal de venta
  // (regla de negocio, no solo del permiso plano orders:verify_payment que ya
  // exige el guard): ONLINE sigue siendo exclusivo del Administrador (el
  // unico que revisa la cuenta de Nequi/Bre-B); PRESENCIAL (efectivo en el
  // stand) es exclusivo del Vendedor, el Administrador no tiene alcance ahi.
  async verifyPayment(orderId: string, actingUser: ActingUser, dto: VerifyPaymentDto) {
    const order = await this.findOrderOrThrow(orderId);

    if (order.salesChannel === SalesChannel.ONLINE && actingUser.roleSlug !== RoleSlug.ADMIN) {
      throw new ForbiddenException(
        'Solo el Administrador puede confirmar o rechazar un pago en linea (Nequi/Bre-B).',
      );
    }
    if (order.salesChannel === SalesChannel.PRESENCIAL && actingUser.roleSlug !== RoleSlug.SELLER) {
      throw new ForbiddenException(
        'Ese pago presencial debe confirmarlo un Vendedor en el stand, no el Administrador.',
      );
    }

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
        const items = await tx.orderItem.findMany({
          where: { orderId },
          include: { selectedAddOnOption: true },
        });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });

          // Simetrico al descuento en selectRaffleNumber: si el acompañante
          // elegido tenia un producto vendible enlazado, tambien se le
          // restaura el stock.
          const linkedProductId = item.selectedAddOnOption?.linkedProductId;
          if (linkedProductId) {
            await tx.product.update({
              where: { id: linkedProductId },
              data: { stock: { increment: item.quantity } },
            });
          }
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

  // "Tomar" una entrega ya no es una accion aparte del Administrador: es
  // simplemente ser quien hace el primer cambio de estado de un pedido en
  // estado entregable (ver findMyDeliveries, que ya no filtra por vendedor
  // asignado). DeliveryAssignment se sigue usando para dejar registro de
  // quien la marco, pero no bloquea a nadie mas de tomarla despues.
  async updateDeliveryStatus(
    orderId: string,
    deliveryPersonId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const order = await this.findOrderOrThrow(orderId);
    const deliverableStatuses: string[] = [
      OrderStatus.PAYMENT_VERIFIED,
      OrderStatus.IN_PREPARATION,
      OrderStatus.IN_ROUTE,
    ];
    if (!deliverableStatuses.includes(order.status)) {
      throw new BadRequestException('Este pedido no esta en un estado listo para entrega.');
    }

    const isDelivered = dto.status === DeliveryAssignmentStatus.DELIVERED;
    if (isDelivered && !dto.receivedBy) {
      throw new BadRequestException('receivedBy es obligatorio para confirmar la entrega.');
    }

    const { updatedAssignment, deliveryDetail } = await this.prisma.$transaction(async (tx) => {
      const existingAssignment = await tx.deliveryAssignment.findFirst({
        where: { orderId },
        orderBy: { assignedAt: 'desc' },
      });
      const assignmentData = {
        deliveryPersonId,
        status: dto.status,
        receivedBy: dto.receivedBy,
        teamsConfirmationLog: dto.teamsConfirmationLog,
        notes: dto.notes,
        deliveredAt: isDelivered ? new Date() : undefined,
      };
      const updatedAssignment = existingAssignment
        ? await tx.deliveryAssignment.update({
            where: { id: existingAssignment.id },
            data: assignmentData,
          })
        : await tx.deliveryAssignment.create({ data: { orderId, ...assignmentData } });

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
    // el correo falla - ver MailerService.sendDeliveryConfirmation. Solo
    // aplica si el pedido iba dirigido a otra persona (selfPickup false): si
    // el comprador recogio su propio pedido, ya presencio la entrega y no
    // tiene sentido avisarle por correo que "se entrego".
    if (deliveryDetail && !deliveryDetail.selfPickup) {
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
  // El filtro NO se puede resolver en el WHERE de Prisma: buyerFullName esta
  // cifrado con IV aleatorio (ver DatabaseEncryptionService), asi que un
  // `contains` en la BD compara contra el texto cifrado y nunca coincide con
  // una subcadena real del nombre en claro. Se trae la cola completa (ya
  // descifrada por la extension de Prisma) y se filtra en memoria.
  async findMessageQueue(search?: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      where: { status: OrderStatus.MESSAGE_PENDING_REVIEW },
      orderBy: { createdAt: 'asc' },
    });
    const matching = search
      ? orders.filter((order) =>
          order.deliveryDetail?.buyerFullName?.toLowerCase().includes(search.toLowerCase()),
        )
      : orders;
    return matching.map(serializeOrderMessageView);
  }

  // Historico completo del comprador (seccion "Mis pedidos"): buyerEmail es
  // la unica relacion con la cuenta (no hay un buyerId real en Order - ver
  // findOneForUser), y esta cifrado igual que buyerFullName/recipientFullName,
  // asi que el filtro tambien se aplica en memoria tras el fetch. Devuelve la
  // vista completa (igual que findOneForUser para el dueño): es su propia
  // compra, sin nada que ocultarle a si mismo.
  async findMyOrders(email: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
    const needle = email.toLowerCase();
    const matching = orders.filter(
      (order) => order.deliveryDetail?.buyerEmail?.toLowerCase() === needle,
    );
    return matching.map(serializeOrderFull);
  }

  // Mismo motivo que findMessageQueue: recipientFullName tambien esta
  // cifrado, el filtro se aplica en memoria tras el fetch.
  async findByRecipientName(recipientName: string) {
    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
    const needle = recipientName.toLowerCase();
    const matching = orders.filter((order) =>
      order.deliveryDetail?.recipientFullName?.toLowerCase().includes(needle),
    );
    return matching.map(serializeOrderSafe);
  }

  // Pedido individual (GET /orders/:id). Admin/Vendedor ven la misma vista
  // que en el listado (seccion 6 del SDD); el comprador solo puede ver el
  // suyo - el filtro por buyerEmail no se puede hacer en el WHERE de Prisma
  // porque ese campo esta cifrado con IV aleatorio (ver DatabaseEncryptionService),
  // asi que la comprobacion de dueno se hace en memoria tras descifrar.
  async findOneForUser(orderId: string, actingUser: AuthenticatedUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      ...ORDER_WITH_RELATIONS,
    });
    if (!order) {
      throw new NotFoundException(`Pedido '${orderId}' no encontrado.`);
    }

    if (actingUser.permissions.includes(Permissions.ORDERS_READ_ALL)) {
      return serializeOrderFull(order);
    }
    if (actingUser.permissions.includes(Permissions.ORDERS_READ_PUBLIC_SAFE)) {
      return serializeOrderSafe(order);
    }

    const buyerEmail = order.deliveryDetail?.buyerEmail?.toLowerCase();
    if (!buyerEmail || buyerEmail !== actingUser.email.toLowerCase()) {
      throw new ForbiddenException('Este pedido no te pertenece.');
    }
    return serializeOrderFull(order);
  }

  // Todas las entregas pendientes le salen a todos los vendedores por igual:
  // cualquiera puede tomar y marcar cualquiera, sin que el Administrador la
  // asigne primero a alguien en particular.
  async findMyDeliveries(includeDelivered = false) {
    const statuses: OrderStatus[] = [
      OrderStatus.PAYMENT_VERIFIED,
      OrderStatus.IN_PREPARATION,
      OrderStatus.IN_ROUTE,
    ];
    if (includeDelivered) {
      statuses.push(OrderStatus.DELIVERED);
    }

    const orders = await this.prisma.order.findMany({
      ...ORDER_WITH_RELATIONS,
      where: { status: { in: statuses } },
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

  // Valida que cada opcion de acompañante elegida este activa y que su grupo
  // (reutilizable, ver AddOnGroup) realmente este asociado al producto de esa
  // misma linea del carrito - evita que un item quede con una opcion de un
  // grupo no asociado a ese producto, o desactivada.
  private async assertValidAddOnSelections(cartItems: CartItemDto[]) {
    const itemsWithSelection = cartItems.filter((item) => item.selectedAddOnOptionId);
    for (const item of itemsWithSelection) {
      const option = await this.prisma.addOnOption.findUnique({
        where: { id: item.selectedAddOnOptionId! },
        include: { group: { include: { productLinks: true } } },
      });
      const isLinkedToProduct = option?.group.productLinks.some(
        (link) => link.productId === item.productId,
      );
      if (!option || !option.isActive || !isLinkedToProduct) {
        throw new BadRequestException(
          `La opcion de acompañante seleccionada no es valida para el producto '${item.productId}'.`,
        );
      }
    }
  }

  // Regla de negocio: un producto no-giftable (ej. la paleta sola) no se
  // puede enviar a otra persona - si el pedido no es autorrecogida, ningun
  // item del carrito puede ser de un producto con giftable=false. El front
  // ya fuerza selfPickup=true en ese caso, pero se valida igual aca por si
  // alguien llama la API directamente.
  private async assertGiftableIfNotSelfPickup(dto: CreateOrderDto) {
    if (dto.selfPickup) {
      return;
    }

    const productIds = [...new Set(dto.cartItems.map((item) => item.productId))];
    const nonGiftableCount = await this.prisma.product.count({
      where: { id: { in: productIds }, giftable: false },
    });
    if (nonGiftableCount > 0) {
      throw new BadRequestException(
        'Este pedido incluye un producto que solo se puede recoger en el stand, no se puede enviar a otra persona.',
      );
    }
  }

  // Precio vigente de cada producto del carrito al momento de crear el
  // pedido (snapshot) - ver createPublicOrder. No valida stock/isActive aca:
  // esa disponibilidad se sigue verificando recien en selectRaffleNumber,
  // que es cuando de verdad se descuenta.
  private async resolveUnitPrices(cartItems: CartItemDto[]) {
    const productIds = [...new Set(cartItems.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, price: true },
    });

    const unitPrices = new Map(products.map((product) => [product.id, product.price]));
    const missingProductId = productIds.find((productId) => !unitPrices.has(productId));
    if (missingProductId) {
      throw new BadRequestException(`El producto '${missingProductId}' no existe.`);
    }

    return unitPrices;
  }

  // Valida disponibilidad y descuenta stock de un producto - usado tanto para
  // el producto principal de un OrderItem como para el producto vendible
  // enlazado a la opcion de acompañante elegida (ver AddOnOption.linkedProductId),
  // asi ambos casos comparten exactamente el mismo stock/chequeo.
  private async decrementProductStock(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ) {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive || product.stock < quantity) {
      throw new BadRequestException(`Stock insuficiente para '${product?.name ?? productId}'.`);
    }
    await tx.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
  }

  private async findOrderOrThrow(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { deliveryDetail: true },
    });
    if (!order) {
      throw new NotFoundException(`Pedido '${orderId}' no encontrado.`);
    }
    return order;
  }
}
