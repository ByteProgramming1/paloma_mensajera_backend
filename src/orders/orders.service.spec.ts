import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  BuyerType,
  HumanReviewStatus,
  OrderStatus,
  RoleSlug,
  SalesChannel,
} from '../common/enums/domain.enums';

function buildMailerMock() {
  return { sendDeliveryConfirmation: jest.fn() };
}

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  const tx = {
    order: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
    orderItem: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    product: { findUnique: jest.fn(), update: jest.fn() },
    raffleNumber: { updateMany: jest.fn(), update: jest.fn() },
    paymentTransaction: { create: jest.fn(), update: jest.fn() },
    messageReview: { update: jest.fn() },
    deliveryAssignment: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    deliveryDetail: { findUnique: jest.fn() },
  };

  type Tx = typeof tx;

  return {
    order: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    deliveryAssignment: { findFirst: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: Tx) => unknown) => callback(tx)),
    __tx: tx,
    ...overrides,
  };
}

describe('OrdersService', () => {
  describe('createPublicOrder', () => {
    const baseDto = {
      buyerFullName: 'Ana Compradora',
      buyerEmail: 'ana@escuelaing.edu.co',
      buyerPhone: '3001234567',
      buyerType: BuyerType.ESTUDIANTE,
      buyerCareerOrArea: 'Ingenieria de Sistemas',
      cartItems: [{ productId: 'p1', quantity: 1 }],
      letterContent: 'Feliz dia!',
      isAnonymous: false,
      salesChannel: SalesChannel.ONLINE,
    };

    it('copia los datos del comprador al destinatario cuando selfPickup es true', async () => {
      const prisma = buildPrismaMock();
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.createPublicOrder({
        ...baseDto,
        selfPickup: true,
        deliveryNotes: 'Paso a las 3pm',
      } as never);

      const createArgs = prisma.order.create.mock.calls[0][0];
      expect(createArgs.data.status).toBe(OrderStatus.MESSAGE_PENDING_REVIEW);
      expect(createArgs.data.deliveryDetail.create.recipientFullName).toBe('Ana Compradora');
      expect(createArgs.data.deliveryDetail.create.recipientTeamsUser).toBe(
        'ana@escuelaing.edu.co',
      );
      expect(createArgs.data.deliveryDetail.create.deliveryNotes).toBe('Paso a las 3pm');
      expect(createArgs.data.messageReview.create.humanReviewStatus).toBe(
        HumanReviewStatus.PENDING,
      );
    });

    it('usa los datos del destinatario indicado cuando selfPickup es false', async () => {
      const prisma = buildPrismaMock();
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.createPublicOrder({
        ...baseDto,
        selfPickup: false,
        recipientFullName: 'Otro Destino',
        recipientCareerOrArea: 'Administracion',
        recipientTeamsUser: 'otro@escuelaing.edu.co',
      } as never);

      const createArgs = prisma.order.create.mock.calls[0][0];
      expect(createArgs.data.deliveryDetail.create.recipientFullName).toBe('Otro Destino');
      expect(createArgs.data.deliveryDetail.create.recipientTeamsUser).toBe(
        'otro@escuelaing.edu.co',
      );
      expect(createArgs.data.deliveryDetail.create.deliveryNotes).toBeNull();
    });
  });

  describe('verifyMessage', () => {
    it('rechaza si el pedido no esta pendiente de revision', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PAYMENT_PENDING });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyMessage('o1', 'reviewer1', { approved: true } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('exige rejectionReason cuando approved es false', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyMessage('o1', 'reviewer1', { approved: false } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('aprueba el mensaje y limpia el motivo de rechazo', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.verifyMessage('o1', 'reviewer1', { approved: true } as never);

      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.MESSAGE_APPROVED },
      });
      const reviewUpdate = prisma.__tx.messageReview.update.mock.calls[0][0];
      expect(reviewUpdate.data.humanReviewStatus).toBe(HumanReviewStatus.APPROVED);
      expect(reviewUpdate.data.rejectionReason).toBeNull();
      expect(reviewUpdate.data.reviewedByUserId).toBe('reviewer1');
    });

    it('permite re-revisar un pedido previamente rechazado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.MESSAGE_REJECTED });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.verifyMessage('o1', 'reviewer1', { approved: true } as never);

      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.MESSAGE_APPROVED },
      });
    });
  });

  describe('selectRaffleNumber', () => {
    it('rechaza si el mensaje no esta aprobado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(service.selectRaffleNumber('o1', { raffleNumberId: 'r1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza 409 si el numero de rifa ya fue tomado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.MESSAGE_APPROVED });
      prisma.__tx.orderItem.findMany.mockResolvedValue([
        { id: 'i1', productId: 'p1', quantity: 1 },
      ]);
      prisma.__tx.product.findUnique.mockResolvedValue({
        id: 'p1',
        name: 'Combo',
        isActive: true,
        stock: 5,
        price: 1000,
      });
      prisma.__tx.raffleNumber.updateMany.mockResolvedValue({ count: 0 });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(service.selectRaffleNumber('o1', { raffleNumberId: 'r1' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rechaza si el stock es insuficiente', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.MESSAGE_APPROVED });
      prisma.__tx.orderItem.findMany.mockResolvedValue([
        { id: 'i1', productId: 'p1', quantity: 5 },
      ]);
      prisma.__tx.product.findUnique.mockResolvedValue({
        id: 'p1',
        name: 'Combo',
        isActive: true,
        stock: 1,
        price: 1000,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(service.selectRaffleNumber('o1', { raffleNumberId: 'r1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyPayment', () => {
    it('rechaza a cualquiera que no sea admin, incluso al vendedor de la venta', async () => {
      const prisma = buildPrismaMock();
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPayment('o1', { userId: 'seller1', roleSlug: RoleSlug.SELLER }, {
          verified: true,
        } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza si el pedido no esta en PAYMENT_PENDING', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PAYMENT_VERIFIED });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPayment('o1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
          verified: true,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('al rechazar el pago, libera la rifa y restaura el stock del carrito', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PAYMENT_PENDING });
      prisma.__tx.orderItem.findMany.mockResolvedValue([
        { id: 'i1', productId: 'p1', quantity: 2 },
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.verifyPayment('o1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
        verified: false,
      } as never);

      expect(prisma.__tx.raffleNumber.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'o1' },
        data: { status: 'AVAILABLE', orderId: null },
      });
      expect(prisma.__tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { increment: 2 } },
      });
      const paymentUpdate = prisma.__tx.paymentTransaction.update.mock.calls[0][0];
      expect(paymentUpdate.data.verifiedByAdminId).toBe('admin1');
      expect(paymentUpdate.data.verified).toBe(false);
    });
  });

  describe('updateDeliveryStatus', () => {
    it('rechaza si el pedido no esta en un estado listo para entrega', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.updateDeliveryStatus('o1', 'seller1', {
          status: 'DELIVERED',
          receivedBy: 'Ana',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('exige receivedBy para marcar como entregado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.IN_ROUTE });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.updateDeliveryStatus('o1', 'seller1', { status: 'DELIVERED' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea el registro de asignacion si nadie habia tomado la entrega todavia', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PAYMENT_VERIFIED });
      prisma.__tx.deliveryAssignment.findFirst.mockResolvedValue(null);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.updateDeliveryStatus('o1', 'seller1', { status: 'IN_ROUTE' } as never);

      expect(prisma.__tx.deliveryAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ orderId: 'o1', deliveryPersonId: 'seller1' }),
      });
      expect(prisma.__tx.deliveryAssignment.update).not.toHaveBeenCalled();
    });

    it('reasigna a quien marca el estado, sin importar quien tomo la entrega antes', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.IN_ROUTE });
      prisma.__tx.deliveryAssignment.findFirst.mockResolvedValue({
        id: 'a1',
        deliveryPersonId: 'seller1',
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.updateDeliveryStatus('o1', 'seller2', {
        status: 'DELIVERED',
        receivedBy: 'Ana',
      } as never);

      expect(prisma.__tx.deliveryAssignment.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: expect.objectContaining({ deliveryPersonId: 'seller2' }),
      });
      expect(prisma.__tx.deliveryAssignment.create).not.toHaveBeenCalled();
    });

    it('al marcar como entregado, envia el correo de confirmacion al comprador', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.IN_ROUTE });
      prisma.__tx.deliveryAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.__tx.deliveryAssignment.update.mockResolvedValue({ id: 'a1', status: 'DELIVERED' });
      prisma.__tx.deliveryDetail.findUnique.mockResolvedValue({
        buyerEmail: 'ana@escuelaing.edu.co',
        buyerFullName: 'Ana Compradora',
      });
      const mailer = buildMailerMock();
      const service = new OrdersService(prisma as never, mailer as never);

      await service.updateDeliveryStatus('o1', 'seller1', {
        status: 'DELIVERED',
        receivedBy: 'Ana',
      } as never);

      expect(mailer.sendDeliveryConfirmation).toHaveBeenCalledWith(
        'ana@escuelaing.edu.co',
        'Ana Compradora',
      );
    });

    it('no envia correo si el estado no es entregado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PAYMENT_VERIFIED });
      prisma.__tx.deliveryAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.__tx.deliveryAssignment.update.mockResolvedValue({ id: 'a1', status: 'IN_ROUTE' });
      const mailer = buildMailerMock();
      const service = new OrdersService(prisma as never, mailer as never);

      await service.updateDeliveryStatus('o1', 'seller1', { status: 'UNDELIVERED_RETRY' } as never);

      expect(mailer.sendDeliveryConfirmation).not.toHaveBeenCalled();
      expect(prisma.__tx.deliveryDetail.findUnique).not.toHaveBeenCalled();
    });
  });

  function buildOrderStub(overrides: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      orderCode: 'PM-0001',
      status: OrderStatus.MESSAGE_PENDING_REVIEW,
      totalAmount: 0,
      salesChannel: SalesChannel.ONLINE,
      createdAt: new Date(),
      raffleNumber: null,
      items: [],
      deliveryDetail: { buyerFullName: 'Buyer QA', recipientFullName: 'Buyer QA' },
      ...overrides,
    };
  }

  describe('findMessageQueue', () => {
    // Regresion: buyerFullName esta cifrado en la BD (ver
    // DatabaseEncryptionService) - el filtro no puede ser un `contains` de
    // Prisma en el WHERE (compararia contra el texto cifrado), tiene que
    // aplicarse en memoria sobre el valor ya descifrado por la extension.
    it('filtra por subcadena del nombre del comprador, sin distinguir mayusculas', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findMany.mockResolvedValue([
        buildOrderStub({ id: 'o1', deliveryDetail: { buyerFullName: 'Buyer QA' } }),
        buildOrderStub({ id: 'o2', deliveryDetail: { buyerFullName: 'Otra Persona' } }),
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      const result = await service.findMessageQueue('buyer');

      expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
      });
      expect(result.map((o: { orderId: string }) => o.orderId)).toEqual(['o1']);
    });

    it('sin search, devuelve toda la cola sin filtrar', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findMany.mockResolvedValue([
        buildOrderStub({ id: 'o1' }),
        buildOrderStub({ id: 'o2', deliveryDetail: { buyerFullName: 'Otra Persona' } }),
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      const result = await service.findMessageQueue();

      expect(result).toHaveLength(2);
    });
  });

  describe('findByRecipientName', () => {
    it('filtra por subcadena del nombre del destinatario, sin distinguir mayusculas', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findMany.mockResolvedValue([
        buildOrderStub({ id: 'o1', deliveryDetail: { recipientFullName: 'Buyer QA' } }),
        buildOrderStub({ id: 'o2', deliveryDetail: { recipientFullName: 'Otra Persona' } }),
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      const result = await service.findByRecipientName('QA');

      expect(result.map((o: { id: string }) => o.id)).toEqual(['o1']);
    });
  });
});
