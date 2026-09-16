import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [statusCounts, channelCounts, totalRevenue] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ['salesChannel'],
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      // Solo pedidos con pago verificado: un pedido cancelado, rechazado o
      // que ni siquiera ha pagado no es un ingreso real todavia (mismo
      // criterio que "Caja fisica"/"Caja digital", ver verifiedByChannel en
      // el frontend admin).
      this.prisma.order.aggregate({
        where: { paymentTransaction: { verified: true }, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      ordersByStatus: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
      ordersBySalesChannel: Object.fromEntries(
        channelCounts.map((row) => [
          row.salesChannel,
          { count: row._count._all, totalAmount: row._sum.totalAmount ?? 0 },
        ]),
      ),
      totalRevenue: totalRevenue._sum.totalAmount ?? 0,
    };
  }
}
