import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { GraphClientService } from './graph-client.service';
import { NotificationMode } from '../common/enums/domain.enums';

@Injectable()
export class TeamsNotificationService {
  private readonly logger = new Logger(TeamsNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly graphClient: GraphClientService,
  ) {}

  private buildDeliveryMessage(recipientName: string, itemNames: string[]): string {
    return `Hola ${recipientName}, tu pedido de Paloma Mensajera (${itemNames.join(', ')}) ya esta listo para recoger. Coordina con el encargado el dia y lugar de entrega.`;
  }

  async notify(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { deliveryDetail: true, items: { include: { product: true } } },
    });

    const mode = await this.settingsService.getNotificationMode();
    const message = this.buildDeliveryMessage(
      order.deliveryDetail!.recipientName,
      order.items.map((item) => item.product.name),
    );

    if (mode === NotificationMode.AUTOMATIC) {
      try {
        const messageId = await this.graphClient.sendChatMessage(
          order.deliveryDetail!.recipientTeamsUser,
          message,
        );
        return this.prisma.deliveryDetail.update({
          where: { orderId },
          data: { teamsNotificationSent: true, teamsGraphMessageId: messageId },
        });
      } catch (error) {
        // Degradacion controlada: no se bloquea la entrega, se marca para envio manual.
        this.logger.warn(
          `Graph API fallo para el pedido ${order.orderCode}, se requiere envio manual.`,
          error instanceof Error ? error.stack : undefined,
        );
        return this.prisma.deliveryDetail.update({
          where: { orderId },
          data: { teamsNotificationSent: false },
        });
      }
    }

    // Modo manual: el encargado copia/pega o envia el mensaje sugerido desde Teams
    // y confirma con este mismo endpoint.
    return this.prisma.deliveryDetail.update({
      where: { orderId },
      data: { teamsNotificationSent: true },
    });
  }
}
