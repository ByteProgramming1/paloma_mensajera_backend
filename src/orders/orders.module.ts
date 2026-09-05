import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailerModule } from '../mailer/mailer.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// ModerationModule ya no se importa aqui: el SDD vigente elimina el filtro
// automatico/IA por completo (revision 100% manual del Vendedor). El modulo
// se deja intacto en src/moderation/ sin usarse, por si se retoma mas adelante.
@Module({
  imports: [NotificationsModule, MailerModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
