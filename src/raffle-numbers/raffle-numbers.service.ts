import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '../common/enums/domain.enums';

@Injectable()
export class RaffleNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  findMap() {
    return this.prisma.raffleNumber.findMany({
      select: { id: true, number: true, status: true },
      orderBy: { number: 'asc' },
    });
  }

  findEligibleForDraw() {
    return this.prisma.raffleNumber.findMany({
      where: {
        drawnAsWinner: false,
        order: { status: OrderStatus.PAYMENT_VERIFIED },
      },
      select: { id: true, number: true, orderId: true },
      orderBy: { number: 'asc' },
    });
  }

  async draw(adminId: string, isAdmin: boolean, drawBatchId?: string) {
    const eligible = await this.findEligibleForDraw();
    if (eligible.length === 0) {
      throw new BadRequestException('No hay numeros elegibles para el sorteo.');
    }

    // Aleatoriedad criptograficamente segura (crypto.randomInt) - ver seccion 8.6 del SDD.
    const winnerIndex = randomInt(0, eligible.length);
    const winner = eligible[winnerIndex];
    const batchId = drawBatchId ?? `Premio ${(await this.countDrawRounds()) + 1}`;
    const drawnAt = new Date();

    const [, order] = await this.prisma.$transaction([
      this.prisma.raffleNumber.update({
        where: { id: winner.id },
        data: { drawnAsWinner: true, drawnAt, drawBatchId: batchId },
      }),
      this.prisma.order.findUniqueOrThrow({
        where: { id: winner.orderId! },
        include: { deliveryDetail: true, items: { include: { product: true } } },
      }),
      this.prisma.drawRound.create({
        data: {
          drawBatchId: batchId,
          raffleNumberId: winner.id,
          orderId: winner.orderId!,
          drawnAt,
          drawnByAdminId: adminId,
        },
      }),
    ]);

    return {
      raffleNumber: winner.number,
      drawBatchId: batchId,
      drawnAt,
      recipientName: order.deliveryDetail?.recipientName,
      buyerName: order.deliveryDetail?.isAnonymous && !isAdmin ? undefined : order.deliveryDetail?.buyerName,
      items: order.items.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
      })),
    };
  }

  drawHistory() {
    return this.prisma.drawRound.findMany({
      orderBy: { drawnAt: 'desc' },
      include: {
        raffleNumber: { select: { number: true } },
        order: { include: { deliveryDetail: true } },
      },
    });
  }

  private countDrawRounds() {
    return this.prisma.drawRound.count();
  }
}
