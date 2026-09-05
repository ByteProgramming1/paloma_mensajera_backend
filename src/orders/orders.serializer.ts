// Se tipa contra el cliente generado de Postgres (motor principal), no contra
// el paquete generico `@prisma/client` (sus tipos por defecto quedan
// desactualizados porque ya no generamos ahi - ver src/prisma/prisma.service.ts).
import { Prisma } from '../../prisma/postgresql/generated';

export const ORDER_WITH_RELATIONS = Prisma.validator<Prisma.OrderDefaultArgs>()({
  include: {
    deliveryDetail: true,
    messageReview: true,
    paymentTransaction: true,
    raffleNumber: { select: { id: true, number: true, status: true } },
    items: { include: { product: true } },
    deliveryAssignments: true,
  },
});

export type OrderWithRelations = Prisma.OrderGetPayload<typeof ORDER_WITH_RELATIONS>;

function baseOrderFields(order: OrderWithRelations) {
  return {
    id: order.id,
    orderCode: order.orderCode,
    status: order.status,
    totalAmount: order.totalAmount,
    salesChannel: order.salesChannel,
    createdAt: order.createdAt,
    raffleNumber: order.raffleNumber ? order.raffleNumber.number : null,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

// Vista completa, exclusiva del rol admin (seccion 5: visibilidad total sin filtros).
export function serializeOrderFull(order: OrderWithRelations) {
  return {
    ...baseOrderFields(order),
    buyerName: order.deliveryDetail?.buyerName,
    buyerEmail: order.deliveryDetail?.buyerEmail,
    buyerPhone: order.deliveryDetail?.buyerPhone,
    recipientName: order.deliveryDetail?.recipientName,
    recipientTeamsUser: order.deliveryDetail?.recipientTeamsUser,
    letterContent: order.deliveryDetail?.letterContent,
    isAnonymous: order.deliveryDetail?.isAnonymous,
    teamsNotificationSent: order.deliveryDetail?.teamsNotificationSent,
    payment: order.paymentTransaction,
    messageReview: order.messageReview
      ? {
          humanReviewStatus: order.messageReview.humanReviewStatus,
          rejectionReason: order.messageReview.rejectionReason,
          reviewedByUserId: order.messageReview.reviewedByUserId,
          reviewedAt: order.messageReview.reviewedAt,
        }
      : null,
  };
}

// Vista para seller/delivery (orders:read_public_safe): buyerName se omite (no se
// envia, ni ofuscado ni vacio) cuando el pedido es anonimo - ver HU-05.
export function serializeOrderSafe(order: OrderWithRelations) {
  const isAnonymous = order.deliveryDetail?.isAnonymous ?? false;
  return {
    ...baseOrderFields(order),
    ...(isAnonymous ? {} : { buyerName: order.deliveryDetail?.buyerName }),
    recipientName: order.deliveryDetail?.recipientName,
    recipientTeamsUser: order.deliveryDetail?.recipientTeamsUser,
    letterContent: order.deliveryDetail?.letterContent,
    isAnonymous,
    teamsNotificationSent: order.deliveryDetail?.teamsNotificationSent,
  };
}

// OrderMessageView de la cola del Verificador (seccion 3.2): unicamente la
// dedicatoria, sin ninguna identidad (ni remitente, ni destinatario, ni carrito).
export function serializeOrderMessageView(order: OrderWithRelations) {
  return {
    orderId: order.id,
    orderCode: order.orderCode,
    letterContent: order.deliveryDetail?.letterContent,
  };
}

// OrderPaymentView del Verificador (seccion 3.5): unicamente lo necesario para
// cruzar contra la app de Nequi. Deliberadamente excluye destinatario y dedicatoria.
export function serializeOrderPaymentView(order: OrderWithRelations) {
  return {
    orderId: order.id,
    orderCode: order.orderCode,
    buyerName: order.deliveryDetail?.buyerName,
    buyerPhone: order.deliveryDetail?.buyerPhone,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentTransaction?.paymentMethod,
    status: order.status,
  };
}
