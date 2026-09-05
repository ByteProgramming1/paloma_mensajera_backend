import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Envio de correo via SMTP (seccion 16 del SDD, variables SMTP_* ya
// declaradas). Se usa unicamente para el auto-registro con verificacion de
// correo: no depende de Microsoft Graph ni de Azure AD para nada, por lo que
// funciona aunque TI nunca otorgue esos permisos.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {}

  private isConfigured(): boolean {
    return !!this.configService.get<string>('SMTP_HOST');
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('SMTP_HOST'),
        port: this.configService.get<number>('SMTP_PORT'),
        secure: this.configService.get<number>('SMTP_PORT') === 465,
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASSWORD'),
        },
      });
    }
    return this.transporter;
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'El envio de correos no esta configurado en el servidor (variables SMTP_*).',
      );
    }

    try {
      await this.getTransporter().sendMail({
        from: this.configService.get<string>('SMTP_USER'),
        to: email,
        subject: 'Tu codigo de verificacion - Paloma Mensajera',
        text: `Tu codigo de verificacion es: ${code}\n\nExpira en 15 minutos. Si no solicitaste esto, ignora este correo.`,
        html: `<p>Tu codigo de verificacion es: <strong>${code}</strong></p><p>Expira en 15 minutos. Si no solicitaste esto, ignora este correo.</p>`,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo de verificacion a ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('No fue posible enviar el correo de verificacion.');
    }
  }
}
