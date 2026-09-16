import { MetricsService } from './metrics.service';

function buildPrismaMock() {
  return {
    order: {
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 42000 } }),
    },
  };
}

describe('MetricsService', () => {
  it('suma totalRevenue solo con pedidos de pago verificado y no cancelados', async () => {
    const prisma = buildPrismaMock();
    const service = new MetricsService(prisma as never);

    const summary = await service.getSummary();

    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: { paymentTransaction: { verified: true }, status: { not: 'CANCELLED' } },
      _sum: { totalAmount: true },
    });
    expect(summary.totalRevenue).toBe(42000);
  });
});
