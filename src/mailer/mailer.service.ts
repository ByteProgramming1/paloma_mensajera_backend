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
    return Boolean(
      this.configService.get<string>('SMTP_HOST') ||
      (this.configService.get<string>('ID_CLIENTE') &&
        this.configService.get<string>('SECRETO_CLIENTE') &&
        this.configService.get<string>('GOOGLE_REFRESH_TOKEN')),
    );
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const user = this.getSmtpUser();
      const pass = this.configService.get<string>('SMTP_PASSWORD');
      const clientId = this.configService.get<string>('ID_CLIENTE');
      const clientSecret = this.configService.get<string>('SECRETO_CLIENTE');
      const refreshToken = this.configService.get<string>('GOOGLE_REFRESH_TOKEN');
      const transportOptions: Parameters<typeof nodemailer.createTransport>[0] =
        user && clientId && clientSecret && refreshToken
          ? {
              service: 'gmail',
              auth: { type: 'OAuth2', user, clientId, clientSecret, refreshToken },
            }
          : {
              host: this.configService.get<string>('SMTP_HOST'),
              port: this.configService.get<number>('SMTP_PORT'),
              secure: this.configService.get<number>('SMTP_PORT') === 465,
              connectionTimeout: 10_000,
              greetingTimeout: 10_000,
              socketTimeout: 15_000,
              ...(user && pass ? { auth: { user, pass } } : {}),
            };
      this.transporter = nodemailer.createTransport(transportOptions);
    }
    return this.transporter;
  }

  async sendVerificationCode(email: string, code: string, name: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'El envio de correos no esta configurado en el servidor (variables SMTP_*).',
      );
    }

    const safeName = this.escapeHtml(name);
    const html = this.buildEmailShell({
      eyebrow: 'Registro',
      heading: 'Verifica tu correo',
      bodyHtml: `
        <p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.5;">Usa este codigo para verificar tu correo institucional y activar tu cuenta:</p>
        <div style="text-align:center;margin:0 0 20px;">
          <span style="display:inline-block;background-color:#fdf1f3;color:#a72d37;font-size:28px;font-weight:700;letter-spacing:8px;padding:14px 24px;border-radius:8px;">${code}</span>
        </div>
        <p style="margin:0;color:#9ca3af;font-size:13px;text-align:center;">Expira en 15 minutos. Si no solicitaste esto, ignora este correo.</p>
      `,
    });

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email,
        subject: 'Tu codigo de verificacion - Paloma Mensajera',
        text: `Hola ${name},\n\nTu codigo de verificacion es: ${code}\n\nExpira en 15 minutos. Si no solicitaste esto, ignora este correo.`,
        html,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo de verificacion a ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('No fue posible enviar el correo de verificacion.');
    }
  }

  // Notificacion al comprador cuando su pedido ya fue entregado (a diferencia
  // de sendVerificationCode, aqui un fallo de envio NO debe bloquear la
  // confirmacion de entrega en OrdersService: se registra el error y se sigue.
  async sendDeliveryConfirmation(email: string, buyerName: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(`SMTP no configurado: no se envio la confirmacion de entrega a ${email}.`);
      return;
    }

    const safeName = this.escapeHtml(buyerName);
    const html = this.buildEmailShell({
      eyebrow: 'Entregas',
      heading: 'Tu compra fue entregada',
      bodyHtml: `
        <p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.5;">Tu compra ya fue entregada correctamente a la persona que designaste. Gracias por usar Paloma Mensajera.</p>
        <div style="text-align:center;">
          <span style="display:inline-block;background-color:#d27b9f;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:6px 16px;border-radius:999px;">Entregado</span>
        </div>
      `,
    });

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email,
        subject: 'Tu compra ha sido entregada - Paloma Mensajera',
        text: `Hola ${buyerName},\n\nTu compra ya ha sido entregada correctamente a la persona que designaste.\n\nGracias por usar Paloma Mensajera.`,
        html,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar la confirmacion de entrega a ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // Estructura visual compartida por todos los correos (seccion de marca):
  // encabezado en degradado con los colores de Paloma Mensajera, tarjeta
  // blanca para el contenido especifico de cada correo, y pie de pagina fijo.
  // Basado en tabla (no flex/grid) por compatibilidad con clientes de correo
  // como Outlook, que ignoran CSS moderno.
  private buildEmailShell(options: { eyebrow: string; heading: string; bodyHtml: string }): string {
    const year = new Date().getFullYear();
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:#a72d37;background-image:linear-gradient(135deg,#bd231f,#a72d37);padding:32px 24px;text-align:center;">
            <div style="width:56px;height:56px;border-radius:50%;background-color:rgba(255,255,255,0.15);line-height:56px;font-size:28px;margin:0 auto 12px;">&#128330;</div>
            <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">PALOMA MENSAJERA</div>
            <div style="color:#d27b9f;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">${this.escapeHtml(options.eyebrow)}</div>
            <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:16px;">${this.escapeHtml(options.heading)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 24px;">
            ${options.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;border-top:1px solid #f0f0f0;text-align:center;">
            <div style="color:#a72d37;font-size:13px;font-weight:700;">PALOMA MENSAJERA</div>
            <div style="color:#9ca3af;font-size:12px;margin-top:4px;">Regalos con dedicatoria para la comunidad ECI.</div>
            <div style="color:#c1c5cb;font-size:11px;margin-top:12px;line-height:1.5;">Este es un correo automatico, por favor no respondas a este mensaje.<br>&copy; ${year} Paloma Mensajera &mdash; Todos los derechos reservados.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getFromAddress(): string {
    return (
      this.configService.get<string>('SMTP_FROM') || this.getSmtpUser() || 'no-reply@paloma.local'
    );
  }

  private getSmtpUser(): string | undefined {
    return (
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('GMAIL') ||
      undefined
    );
  }
}
