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

// Vista completa, exclusiva del rol admin (seccion 6 del SDD vigente): ve todo
// sin ninguna restriccion de campos - por eso ya no existe un "OrderPaymentView"
// separado, el admin usa esta misma vista tambien para verificar pagos.
export function serializeOrderFull(order: OrderWithRelations) {
  return {
    ...baseOrderFields(order),
    buyerFullName: order.deliveryDetail?.buyerFullName,
    buyerEmail: order.deliveryDetail?.buyerEmail,
    buyerPhone: order.deliveryDetail?.buyerPhone,
    buyerType: order.deliveryDetail?.buyerType,
    buyerCareerOrArea: order.deliveryDetail?.buyerCareerOrArea,
    selfPickup: order.deliveryDetail?.selfPickup,
    recipientFullName: order.deliveryDetail?.recipientFullName,
    recipientCareerOrArea: order.deliveryDetail?.recipientCareerOrArea,
    recipientTeamsUser: order.deliveryDetail?.recipientTeamsUser,
    deliveryNotes: order.deliveryDetail?.deliveryNotes,
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

// Vista para el Vendedor (orders:read_public_safe): buyerFullName se omite
// (no se envia, ni ofuscado ni vacio) cuando el pedido es anonimo - ver HU-06.
export function serializeOrderSafe(order: OrderWithRelations) {
  const isAnonymous = order.deliveryDetail?.isAnonymous ?? false;
  return {
    ...baseOrderFields(order),
    ...(isAnonymous ? {} : { buyerFullName: order.deliveryDetail?.buyerFullName }),
    selfPickup: order.deliveryDetail?.selfPickup,
    recipientFullName: order.deliveryDetail?.recipientFullName,
    recipientTeamsUser: order.deliveryDetail?.recipientTeamsUser,
    deliveryNotes: order.deliveryDetail?.deliveryNotes,
    letterContent: order.deliveryDetail?.letterContent,
    isAnonymous,
    teamsNotificationSent: order.deliveryDetail?.teamsNotificationSent,
  };
}

// OrderMessagePendingView de la cola del Vendedor (seccion 3.2 del SDD
// vigente): a diferencia del diseno anterior con Verificador, el Vendedor SI
// necesita identidad (para poder buscar al comprador por nombre) y contexto
// de autorrecogida/comentario, no solo el texto de la dedicatoria.
export function serializeOrderMessageView(order: OrderWithRelations) {
  return {
    orderId: order.id,
    orderCode: order.orderCode,
    buyerFullName: order.deliveryDetail?.buyerFullName,
    recipientFullName: order.deliveryDetail?.recipientFullName,
    letterContent: order.deliveryDetail?.letterContent,
    isAnonymous: order.deliveryDetail?.isAnonymous,
    selfPickup: order.deliveryDetail?.selfPickup,
    deliveryNotes: order.deliveryDetail?.deliveryNotes,
  };
}
