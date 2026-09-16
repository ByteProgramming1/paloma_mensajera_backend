import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Prisma } from '../../prisma/postgresql/generated';
import {
  BuyerType,
  HumanReviewStatus,
  OrderStatus,
  RoleSlug,
  SalesChannel,
} from '../common/enums/domain.enums';

function buildOrderCodeCollisionError() {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`orderCode`)',
    {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['orderCode'] },
    },
  );
}

function buildMailerMock() {
  return { sendDeliveryConfirmation: jest.fn() };
}

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  const tx = {
    order: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: 'new-order', ...data })),
      delete: jest.fn(),
    },
    orderItem: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), create: jest.fn() },
    product: { findUnique: jest.fn(), update: jest.fn() },
    raffleNumber: { updateMany: jest.fn(), update: jest.fn() },
    paymentTransaction: { create: jest.fn(), update: jest.fn() },
    messageReview: { update: jest.fn() },
    deliveryAssignment: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    deliveryDetail: { findUnique: jest.fn(), update: jest.fn() },
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
    product: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([{ id: 'p1', price: 1000 }]),
      findUnique: jest.fn(),
    },
    addOnOption: { findUnique: jest.fn() },
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
      prisma.product.count.mockResolvedValue(1);
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

    it('calcula unitPrice/totalAmount con el precio vigente al crear el pedido, no en 0', async () => {
      const prisma = buildPrismaMock();
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', price: 2500 }]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.createPublicOrder({
        ...baseDto,
        cartItems: [{ productId: 'p1', quantity: 3 }],
        selfPickup: true,
      } as never);

      const createArgs = prisma.order.create.mock.calls[0][0];
      expect(createArgs.data.totalAmount).toBe(7500);
      expect(createArgs.data.items.create[0].unitPrice).toBe(2500);
    });

    it('rechaza si algun producto del carrito no existe', async () => {
      const prisma = buildPrismaMock();
      prisma.product.findMany.mockResolvedValue([]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.createPublicOrder({ ...baseDto, selfPickup: true } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('reintenta con un count fresco si el orderCode choca con el unique (carrera concurrente)', async () => {
      const prisma = buildPrismaMock();
      prisma.order.count.mockResolvedValueOnce(9).mockResolvedValueOnce(10);
      prisma.order.create
        .mockRejectedValueOnce(buildOrderCodeCollisionError())
        .mockImplementationOnce(({ data }) => Promise.resolve({ id: 'new-order', ...data }));
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.createPublicOrder({ ...baseDto, selfPickup: true } as never);

      expect(prisma.order.count).toHaveBeenCalledTimes(2);
      expect(prisma.order.create).toHaveBeenCalledTimes(2);
      expect(prisma.order.create.mock.calls[1][0].data.orderCode).toContain('0011');
    });

    it('rechaza si selfPickup es false y TODO el carrito es de productos no-giftable', async () => {
      const prisma = buildPrismaMock();
      prisma.product.count.mockResolvedValue(0);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.createPublicOrder({
          ...baseDto,
          selfPickup: false,
          recipientFullName: 'Otro Destino',
          recipientCareerOrArea: 'Administracion',
          recipientTeamsUser: 'otro@escuelaing.edu.co',
        } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('permite selfPickup false si el carrito mezcla un producto no-giftable con uno giftable', async () => {
      const prisma = buildPrismaMock();
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', price: 1000 },
        { id: 'p2', price: 2000 },
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.createPublicOrder({
        ...baseDto,
        cartItems: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p2', quantity: 1 },
        ],
        selfPickup: false,
        recipientFullName: 'Otro Destino',
        recipientCareerOrArea: 'Administracion',
        recipientTeamsUser: 'otro@escuelaing.edu.co',
      } as never);

      expect(prisma.order.create).toHaveBeenCalled();
    });

    it('arranca en MESSAGE_APPROVED y sin revisor si no hay dedicatoria', async () => {
      const prisma = buildPrismaMock();
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.createPublicOrder({
        ...baseDto,
        letterContent: '   ',
        selfPickup: true,
      } as never);

      const createArgs = prisma.order.create.mock.calls[0][0];
      expect(createArgs.data.status).toBe(OrderStatus.MESSAGE_APPROVED);
      expect(createArgs.data.messageReview.create.humanReviewStatus).toBe(
        HumanReviewStatus.APPROVED,
      );
      expect(createArgs.data.messageReview.create.reviewedByUserId).toBeUndefined();
    });

    it('sigue el flujo normal de revision si hay dedicatoria', async () => {
      const prisma = buildPrismaMock();
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.createPublicOrder({
        ...baseDto,
        selfPickup: true,
      } as never);

      const createArgs = prisma.order.create.mock.calls[0][0];
      expect(createArgs.data.status).toBe(OrderStatus.MESSAGE_PENDING_REVIEW);
      expect(createArgs.data.messageReview.create.humanReviewStatus).toBe(
        HumanReviewStatus.PENDING,
      );
    });
  });

  describe('createPublicOrdersMulti', () => {
    const baseMultiDto = {
      buyerFullName: 'Ana Compradora',
      buyerEmail: 'ana@escuelaing.edu.co',
      buyerPhone: '3001234567',
      buyerType: BuyerType.ESTUDIANTE,
      buyerCareerOrArea: 'Ingenieria de Sistemas',
      salesChannel: SalesChannel.ONLINE,
    };

    it('crea un pedido por cada destinatario, todos con el mismo groupId', async () => {
      const prisma = buildPrismaMock();
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      const result = await service.createPublicOrdersMulti({
        ...baseMultiDto,
        recipients: [
          {
            selfPickup: true,
            cartItems: [{ productId: 'p1', quantity: 1 }],
            letterContent: 'Para el destinatario 1',
            isAnonymous: false,
          },
          {
            selfPickup: true,
            cartItems: [{ productId: 'p1', quantity: 2 }],
            letterContent: 'Para el destinatario 2',
            isAnonymous: false,
          },
        ],
      } as never);

      expect(prisma.__tx.order.create).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = prisma.__tx.order.create.mock.calls;
      expect(firstCall[0].data.groupId).toBe(result.groupId);
      expect(secondCall[0].data.groupId).toBe(result.groupId);
      expect(firstCall[0].data.orderCode).not.toBe(secondCall[0].data.orderCode);
      expect(result.orders).toHaveLength(2);
    });

    it('no crea ningun pedido si un destinatario no pasa las validaciones (todo o nada)', async () => {
      const prisma = buildPrismaMock();
      // giftableCount por defecto es 0: cualquier destinatario con selfPickup
      // false y sin mockear product.count queda como "todo el carrito no-giftable".
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.createPublicOrdersMulti({
          ...baseMultiDto,
          recipients: [
            {
              selfPickup: true,
              cartItems: [{ productId: 'p1', quantity: 1 }],
              isAnonymous: false,
            },
            {
              selfPickup: false,
              recipientFullName: 'Otro Destino',
              recipientCareerOrArea: 'Administracion',
              recipientTeamsUser: 'otro@escuelaing.edu.co',
              cartItems: [{ productId: 'p1', quantity: 1 }],
              isAnonymous: false,
            },
          ],
        } as never),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.__tx.order.create).not.toHaveBeenCalled();
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

  describe('resubmitMessage', () => {
    it('rechaza si el pedido no le pertenece al comprador autenticado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_REJECTED,
        deliveryDetail: { buyerEmail: 'ana@escuelaing.edu.co' },
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.resubmitMessage(
          'o1',
          { email: 'otro@escuelaing.edu.co' } as never,
          { letterContent: 'Corregido', isAnonymous: false } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza si el pedido no esta en MESSAGE_REJECTED', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_PENDING_REVIEW,
        deliveryDetail: { buyerEmail: 'ana@escuelaing.edu.co' },
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.resubmitMessage(
          'o1',
          { email: 'ana@escuelaing.edu.co' } as never,
          { letterContent: 'Corregido', isAnonymous: false } as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('reenvia la dedicatoria corregida y limpia el rechazo, vuelve a MESSAGE_PENDING_REVIEW', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_REJECTED,
        deliveryDetail: { buyerEmail: 'ana@escuelaing.edu.co' },
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.resubmitMessage(
        'o1',
        { email: 'ana@escuelaing.edu.co' } as never,
        { letterContent: 'Dedicatoria corregida', isAnonymous: true } as never,
      );

      expect(prisma.__tx.deliveryDetail.update).toHaveBeenCalledWith({
        where: { orderId: 'o1' },
        data: { letterContent: 'Dedicatoria corregida', isAnonymous: true },
      });
      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.MESSAGE_PENDING_REVIEW },
      });
      const reviewUpdate = prisma.__tx.messageReview.update.mock.calls[0][0];
      expect(reviewUpdate.data.humanReviewStatus).toBe(HumanReviewStatus.PENDING);
      expect(reviewUpdate.data.rejectionReason).toBeNull();
      expect(reviewUpdate.data.reviewedByUserId).toBeNull();
    });

    it('si la dedicatoria corregida queda vacia, aprueba directo sin pasar por revision', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_REJECTED,
        deliveryDetail: { buyerEmail: 'ana@escuelaing.edu.co' },
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.resubmitMessage(
        'o1',
        { email: 'ana@escuelaing.edu.co' } as never,
        { letterContent: '   ', isAnonymous: false } as never,
      );

      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.MESSAGE_APPROVED },
      });
      const reviewUpdate = prisma.__tx.messageReview.update.mock.calls[0][0];
      expect(reviewUpdate.data.humanReviewStatus).toBe(HumanReviewStatus.APPROVED);
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

    it('descuenta tambien el stock del producto enlazado a la opcion elegida', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.MESSAGE_APPROVED });
      prisma.__tx.orderItem.findMany.mockResolvedValue([
        {
          id: 'i1',
          productId: 'combo1',
          quantity: 2,
          selectedAddOnOption: { id: 'opt1', linkedProductId: 'paleta1' },
        },
      ]);
      prisma.__tx.product.findUnique.mockImplementation(
        ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(
            id === 'combo1'
              ? { id: 'combo1', name: 'Combo', isActive: true, stock: 10 }
              : { id: 'paleta1', name: 'Paleta', isActive: true, stock: 10 },
          ),
      );
      prisma.__tx.raffleNumber.updateMany.mockResolvedValue({ count: 1 });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.selectRaffleNumber('o1', { raffleNumberId: 'r1' } as never);

      expect(prisma.__tx.product.update).toHaveBeenCalledWith({
        where: { id: 'combo1' },
        data: { stock: { decrement: 2 } },
      });
      expect(prisma.__tx.product.update).toHaveBeenCalledWith({
        where: { id: 'paleta1' },
        data: { stock: { decrement: 2 } },
      });
    });

    it('rechaza si el producto enlazado a la opcion elegida no tiene stock, aunque el combo si', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.MESSAGE_APPROVED });
      prisma.__tx.orderItem.findMany.mockResolvedValue([
        {
          id: 'i1',
          productId: 'combo1',
          quantity: 2,
          selectedAddOnOption: { id: 'opt1', linkedProductId: 'paleta1' },
        },
      ]);
      prisma.__tx.product.findUnique.mockImplementation(
        ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(
            id === 'combo1'
              ? { id: 'combo1', name: 'Combo', isActive: true, stock: 10 }
              : { id: 'paleta1', name: 'Paleta', isActive: true, stock: 1 },
          ),
      );
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(service.selectRaffleNumber('o1', { raffleNumberId: 'r1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('crea el pago como CASH si el pedido es PRESENCIAL', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_APPROVED,
        salesChannel: SalesChannel.PRESENCIAL,
      });
      prisma.__tx.raffleNumber.updateMany.mockResolvedValue({ count: 1 });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.selectRaffleNumber('o1', { raffleNumberId: 'r1' } as never);

      expect(prisma.__tx.paymentTransaction.create).toHaveBeenCalledWith({
        data: { orderId: 'o1', paymentMethod: 'CASH', verified: false },
      });
    });

    it('crea el pago como NEQUI si el pedido es ONLINE', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_APPROVED,
        salesChannel: SalesChannel.ONLINE,
      });
      prisma.__tx.raffleNumber.updateMany.mockResolvedValue({ count: 1 });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.selectRaffleNumber('o1', { raffleNumberId: 'r1' } as never);

      expect(prisma.__tx.paymentTransaction.create).toHaveBeenCalledWith({
        data: { orderId: 'o1', paymentMethod: 'NEQUI', verified: false },
      });
    });
  });

  describe('verifyPayment', () => {
    it('permite a un Vendedor verificar un pago PRESENCIAL', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAYMENT_PENDING,
        salesChannel: SalesChannel.PRESENCIAL,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.verifyPayment('o1', { userId: 'seller1', roleSlug: RoleSlug.SELLER }, {
        verified: true,
      } as never);

      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.PAYMENT_VERIFIED },
      });
    });

    it('avisa que el pedido aun no llega a la etapa de pago (distinto de "ya fue verificado")', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.MESSAGE_APPROVED,
        salesChannel: SalesChannel.PRESENCIAL,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPayment('o1', { userId: 'seller1', roleSlug: RoleSlug.SELLER }, {
          verified: true,
        } as never),
      ).rejects.toThrow('todavia no llega a la etapa de pago');
    });

    it('rechaza a un Vendedor que intenta verificar un pago ONLINE', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAYMENT_PENDING,
        salesChannel: SalesChannel.ONLINE,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPayment('o1', { userId: 'seller1', roleSlug: RoleSlug.SELLER }, {
          verified: true,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite a un Administrador verificar un pago ONLINE', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAYMENT_PENDING,
        salesChannel: SalesChannel.ONLINE,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.verifyPayment('o1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
        verified: true,
      } as never);

      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.PAYMENT_VERIFIED },
      });
    });

    it('rechaza a un Administrador que intenta verificar un pago PRESENCIAL', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAYMENT_PENDING,
        salesChannel: SalesChannel.PRESENCIAL,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPayment('o1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
          verified: true,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el pedido no esta en PAYMENT_PENDING', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAYMENT_VERIFIED,
        salesChannel: SalesChannel.ONLINE,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPayment('o1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
          verified: true,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('al rechazar el pago, libera la rifa y restaura el stock del carrito', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAYMENT_PENDING,
        salesChannel: SalesChannel.ONLINE,
      });
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

    it('al rechazar el pago, tambien restaura el stock del producto enlazado al acompañante', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAYMENT_PENDING,
        salesChannel: SalesChannel.ONLINE,
      });
      prisma.__tx.orderItem.findMany.mockResolvedValue([
        {
          id: 'i1',
          productId: 'combo1',
          quantity: 2,
          selectedAddOnOption: { id: 'opt1', linkedProductId: 'paleta1' },
        },
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.verifyPayment('o1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
        verified: false,
      } as never);

      expect(prisma.__tx.product.update).toHaveBeenCalledWith({
        where: { id: 'combo1' },
        data: { stock: { increment: 2 } },
      });
      expect(prisma.__tx.product.update).toHaveBeenCalledWith({
        where: { id: 'paleta1' },
        data: { stock: { increment: 2 } },
      });
    });
  });

  describe('verifyPaymentGroup', () => {
    it('rechaza si no existe ningun pedido con ese groupId', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findMany.mockResolvedValue([]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPaymentGroup('g1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
          verified: true,
        } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('no verifica nada si algun pedido del grupo no puede ser verificado por ese rol (todo o nada)', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: OrderStatus.PAYMENT_PENDING, salesChannel: SalesChannel.ONLINE },
        { id: 'o2', status: OrderStatus.PAYMENT_PENDING, salesChannel: SalesChannel.PRESENCIAL },
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPaymentGroup('g1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
          verified: true,
        } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no verifica nada si algun pedido del grupo ya fue verificado (todo o nada)', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: OrderStatus.PAYMENT_PENDING, salesChannel: SalesChannel.ONLINE },
        { id: 'o2', status: OrderStatus.PAYMENT_VERIFIED, salesChannel: SalesChannel.ONLINE },
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.verifyPaymentGroup('g1', { userId: 'admin1', roleSlug: RoleSlug.ADMIN }, {
          verified: true,
        } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('verifica todos los pedidos del grupo en una sola operacion', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findMany
        .mockResolvedValueOnce([
          { id: 'o1', status: OrderStatus.PAYMENT_PENDING, salesChannel: SalesChannel.ONLINE },
          { id: 'o2', status: OrderStatus.PAYMENT_PENDING, salesChannel: SalesChannel.ONLINE },
        ])
        .mockResolvedValueOnce([
          {
            id: 'o1',
            orderCode: 'PM-2026-0001',
            status: OrderStatus.PAYMENT_VERIFIED,
            totalAmount: 1000,
            salesChannel: SalesChannel.ONLINE,
            createdAt: new Date(),
            raffleNumber: null,
            items: [],
          },
          {
            id: 'o2',
            orderCode: 'PM-2026-0002',
            status: OrderStatus.PAYMENT_VERIFIED,
            totalAmount: 2000,
            salesChannel: SalesChannel.ONLINE,
            createdAt: new Date(),
            raffleNumber: null,
            items: [],
          },
        ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      const result = await service.verifyPaymentGroup(
        'g1',
        { userId: 'admin1', roleSlug: RoleSlug.ADMIN },
        { verified: true } as never,
      );

      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.PAYMENT_VERIFIED },
      });
      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o2' },
        data: { status: OrderStatus.PAYMENT_VERIFIED },
      });
      expect(prisma.__tx.paymentTransaction.update).toHaveBeenCalledTimes(2);
      expect(result.groupId).toBe('g1');
      expect(result.orders).toHaveLength(2);
    });
  });

  describe('deleteOrder', () => {
    it('lanza NotFoundException si el pedido no existe', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue(null);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(service.deleteOrder('o1')).rejects.toThrow(NotFoundException);
    });

    it('rechaza borrar un pedido ya entregado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        orderCode: 'PM-2026-0001',
        status: OrderStatus.DELIVERED,
        raffleNumber: null,
        drawRounds: [],
        deliveryAssignments: [],
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(service.deleteOrder('o1')).rejects.toThrow(ConflictException);
      expect(prisma.__tx.order.delete).not.toHaveBeenCalled();
    });

    it('rechaza borrar un pedido que ya participo en un sorteo', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        orderCode: 'PM-2026-0001',
        status: OrderStatus.PAYMENT_VERIFIED,
        raffleNumber: { id: 'r1' },
        drawRounds: [{ id: 'draw1' }],
        deliveryAssignments: [],
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(service.deleteOrder('o1')).rejects.toThrow(ConflictException);
      expect(prisma.__tx.order.delete).not.toHaveBeenCalled();
    });

    it('borra un pedido sin numero de rifa (ej. MESSAGE_APPROVED) sin tocar stock', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        orderCode: 'PM-2026-0019',
        status: OrderStatus.MESSAGE_APPROVED,
        raffleNumber: null,
        drawRounds: [],
        deliveryAssignments: [],
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      const result = await service.deleteOrder('o1');

      expect(prisma.__tx.raffleNumber.update).not.toHaveBeenCalled();
      expect(prisma.__tx.product.update).not.toHaveBeenCalled();
      expect(prisma.__tx.deliveryAssignment.deleteMany).not.toHaveBeenCalled();
      expect(prisma.__tx.order.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
      expect(result).toEqual({ deleted: true, orderCode: 'PM-2026-0019' });
    });

    it('al borrar un pedido con numero de rifa asignado, lo libera y repone el stock', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        orderCode: 'PM-2026-0002',
        status: OrderStatus.PAYMENT_PENDING,
        raffleNumber: { id: 'r1' },
        drawRounds: [],
        deliveryAssignments: [{ id: 'da1' }],
      });
      prisma.__tx.orderItem.findMany.mockResolvedValue([
        { id: 'i1', productId: 'p1', quantity: 2, selectedAddOnOption: null },
      ]);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.deleteOrder('o1');

      expect(prisma.__tx.raffleNumber.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'AVAILABLE', orderId: null },
      });
      expect(prisma.__tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { increment: 2 } },
      });
      expect(prisma.__tx.deliveryAssignment.deleteMany).toHaveBeenCalledWith({
        where: { orderId: 'o1' },
      });
      expect(prisma.__tx.order.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    });
  });

  describe('addItem', () => {
    it('rechaza si el producto no existe o esta inactivo', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PAYMENT_VERIFIED });
      prisma.product.findUnique.mockResolvedValue(null);
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.addItem('o1', { productId: 'paleta1', quantity: 1 } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza agregar un producto a un pedido cancelado o ya entregado', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.CANCELLED });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await expect(
        service.addItem('o1', { productId: 'paleta1', quantity: 1 } as never),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('descuenta stock, crea el item y suma el precio al totalAmount del pedido', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PAYMENT_VERIFIED });
      prisma.product.findUnique.mockResolvedValue({
        id: 'paleta1',
        name: 'Paleta',
        price: 3000,
        isActive: true,
      });
      prisma.__tx.product.findUnique.mockResolvedValue({
        id: 'paleta1',
        isActive: true,
        stock: 5,
      });
      const service = new OrdersService(prisma as never, buildMailerMock() as never);

      await service.addItem('o1', { productId: 'paleta1', quantity: 1 } as never);

      expect(prisma.__tx.product.update).toHaveBeenCalledWith({
        where: { id: 'paleta1' },
        data: { stock: { decrement: 1 } },
      });
      expect(prisma.__tx.orderItem.create).toHaveBeenCalledWith({
        data: {
          orderId: 'o1',
          productId: 'paleta1',
          quantity: 1,
          unitPrice: 3000,
          selectedAddOnOptionId: null,
        },
      });
      expect(prisma.__tx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { totalAmount: { increment: 3000 } },
      });
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

    it('al marcar como entregado a otra persona (selfPickup false), envia el correo de confirmacion al comprador', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.IN_ROUTE });
      prisma.__tx.deliveryAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.__tx.deliveryAssignment.update.mockResolvedValue({ id: 'a1', status: 'DELIVERED' });
      prisma.__tx.deliveryDetail.findUnique.mockResolvedValue({
        buyerEmail: 'ana@escuelaing.edu.co',
        buyerFullName: 'Ana Compradora',
        selfPickup: false,
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

    it('al marcar como entregado con autorrecogida (selfPickup true), no envia correo', async () => {
      const prisma = buildPrismaMock();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.IN_ROUTE });
      prisma.__tx.deliveryAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.__tx.deliveryAssignment.update.mockResolvedValue({ id: 'a1', status: 'DELIVERED' });
      prisma.__tx.deliveryDetail.findUnique.mockResolvedValue({
        buyerEmail: 'ana@escuelaing.edu.co',
        buyerFullName: 'Ana Compradora',
        selfPickup: true,
      });
      const mailer = buildMailerMock();
      const service = new OrdersService(prisma as never, mailer as never);

      await service.updateDeliveryStatus('o1', 'seller1', {
        status: 'DELIVERED',
        receivedBy: 'Ana',
      } as never);

      expect(mailer.sendDeliveryConfirmation).not.toHaveBeenCalled();
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
