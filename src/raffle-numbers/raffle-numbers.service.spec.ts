import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { RaffleNumbersService } from './raffle-numbers.service';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomInt: jest.fn(),
}));
const randomInt = crypto.randomInt as jest.Mock;

function buildPrismaMock() {
  return {
    raffleNumber: { findMany: jest.fn(), update: jest.fn() },
    order: { findUniqueOrThrow: jest.fn() },
    drawRound: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

describe('RaffleNumbersService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('draw', () => {
    it('lanza 400 si no hay numeros elegibles', async () => {
      const prisma = buildPrismaMock();
      prisma.raffleNumber.findMany.mockResolvedValue([]);
      const service = new RaffleNumbersService(prisma as never);

      await expect(service.draw('admin1', true)).rejects.toThrow(BadRequestException);
    });

    it('usa crypto.randomInt (no Math.random) para elegir al ganador', async () => {
      const prisma = buildPrismaMock();
      prisma.raffleNumber.findMany.mockResolvedValue([
        { id: 'rn1', number: 1, orderId: 'o1' },
        { id: 'rn2', number: 2, orderId: 'o2' },
      ]);
      randomInt.mockReturnValue(1);
      prisma.raffleNumber.update.mockResolvedValue({});
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        deliveryDetail: {
          recipientFullName: 'Destino',
          buyerFullName: 'Compra',
          isAnonymous: false,
        },
        items: [{ product: { name: 'Combo' }, quantity: 1 }],
      });
      prisma.drawRound.create.mockResolvedValue({});
      const service = new RaffleNumbersService(prisma as never);

      const result = await service.draw('admin1', true);

      expect(randomInt).toHaveBeenCalledWith(0, 2);
      expect(result.raffleNumber).toBe(2);
      expect(prisma.raffleNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rn2' } }),
      );
    });

    it('oculta buyerFullName si el pedido es anonimo y quien consulta no es admin', async () => {
      const prisma = buildPrismaMock();
      prisma.raffleNumber.findMany.mockResolvedValue([{ id: 'rn1', number: 1, orderId: 'o1' }]);
      randomInt.mockReturnValue(0);
      prisma.raffleNumber.update.mockResolvedValue({});
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        deliveryDetail: {
          recipientFullName: 'Destino',
          buyerFullName: 'Secreto',
          isAnonymous: true,
        },
        items: [],
      });
      prisma.drawRound.create.mockResolvedValue({});
      const service = new RaffleNumbersService(prisma as never);

      const result = await service.draw('admin1', false);

      expect(result.buyerFullName).toBeUndefined();
    });
  });

  describe('findEligibleForDraw', () => {
    it('filtra por pago verificado, no cancelado y no sorteado antes', async () => {
      const prisma = buildPrismaMock();
      prisma.raffleNumber.findMany.mockResolvedValue([]);
      const service = new RaffleNumbersService(prisma as never);

      await service.findEligibleForDraw();

      const queryArgs = prisma.raffleNumber.findMany.mock.calls[0][0];
      expect(queryArgs.where.drawnAsWinner).toBe(false);
      expect(queryArgs.where.order.paymentTransaction).toEqual({ verified: true });
      expect(queryArgs.where.order.status).toEqual({ not: 'CANCELLED' });
    });
  });
});
