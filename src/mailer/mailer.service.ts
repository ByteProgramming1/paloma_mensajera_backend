import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { join } from 'path';
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

  // Debe reflejar exactamente las mismas condiciones que getTransporter() usa
  // para elegir una rama valida: si isConfigured() da true pero falta algun
  // dato (p.ej. ID_CLIENTE/SECRETO_CLIENTE/GOOGLE_REFRESH_TOKEN sin
  // SMTP_USER/GMAIL), getTransporter() cae al host SMTP sin SMTP_HOST
  // definido y nodemailer intenta conectarse a localhost:587 en vez de
  // fallar con un 503 explicito.
  private isConfigured(): boolean {
    return Boolean(this.configService.get<string>('SMTP_HOST') || this.hasOAuthConfig());
  }

  private hasOAuthConfig(): boolean {
    return Boolean(
      this.getSmtpUser() &&
        this.configService.get<string>('ID_CLIENTE') &&
        this.configService.get<string>('SECRETO_CLIENTE') &&
        this.configService.get<string>('GOOGLE_REFRESH_TOKEN'),
    );
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const host = this.configService.get<string>('SMTP_HOST');
      const transportOptions: Parameters<typeof nodemailer.createTransport>[0] =
        this.hasOAuthConfig()
          ? {
              service: 'gmail',
              // Timeouts explicitos (igual que la rama SMTP de abajo): sin
              // esto, nodemailer usa su default de 2 minutos por intento de
              // conexion, y con las 2 direcciones que resuelve (IPv4 + IPv6,
              // ver shared/resolveHostname) un fallo puede tardar hasta ~4
              // minutos en reportarse en vez de fallar rapido con un 503.
              connectionTimeout: 10_000,
              greetingTimeout: 10_000,
              socketTimeout: 15_000,
              auth: {
                type: 'OAuth2',
                user: this.getSmtpUser(),
                clientId: this.configService.get<string>('ID_CLIENTE'),
                clientSecret: this.configService.get<string>('SECRETO_CLIENTE'),
                refreshToken: this.configService.get<string>('GOOGLE_REFRESH_TOKEN'),
              },
            }
          : (() => {
              if (!host) {
                // No debe ocurrir: isConfigured() ya descarta este caso antes de
                // llegar aqui. Se lanza en vez de dejar que nodemailer intente
                // localhost:587 por defecto.
                throw new ServiceUnavailableException(
                  'El envio de correos no esta configurado en el servidor (variables SMTP_*).',
                );
              }
              const port = this.configService.get<number>('SMTP_PORT');
              const user = this.getSmtpUser();
              const pass = this.configService.get<string>('SMTP_PASSWORD');
              return {
                host,
                port,
                secure: port === 465,
                connectionTimeout: 10_000,
                greetingTimeout: 10_000,
                socketTimeout: 15_000,
                ...(user && pass ? { auth: { user, pass } } : {}),
              };
            })();
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
          <span style="display:inline-block;background-color:#fce7f3;color:#951366;font-size:28px;font-weight:700;letter-spacing:8px;padding:14px 24px;border-radius:8px;">${code}</span>
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
        attachments: [this.getLogoAttachment()],
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo de verificacion a ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('No fue posible enviar el correo de verificacion.');
    }
  }

  async sendPasswordReset(email: string, resetUrl: string, name: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'El envio de correos no esta configurado en el servidor (variables SMTP_*).',
      );
    }

    const safeName = this.escapeHtml(name);
    const safeResetUrl = this.escapeHtml(resetUrl);
    const html = this.buildEmailShell({
      eyebrow: 'Seguridad',
      heading: 'Recupera tu contraseña',
      bodyHtml: `
        <p style="margin:0 0 16px;color:#241b2d;font-size:15px;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 20px;color:#66586b;font-size:14px;line-height:1.5;">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Usa el siguiente botón para continuar:</p>
        <div style="text-align:center;margin:0 0 20px;">
          <a href="${safeResetUrl}" style="display:inline-block;background-color:#951366;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:5px;">Cambiar contraseña</a>
        </div>
        <p style="margin:0;color:#9b8d99;font-size:13px;text-align:center;line-height:1.5;">Este enlace expira en 30 minutos. Si no solicitaste este cambio, puedes ignorar este correo.</p>
      `,
    });

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email,
        subject: 'Recupera tu contraseña - Paloma Mensajera',
        text: `Hola ${name},\n\nCambia tu contraseña aquí: ${resetUrl}\n\nEste enlace expira en 30 minutos. Si no solicitaste este cambio, ignora este correo.`,
        html,
        attachments: [this.getLogoAttachment()],
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo de recuperacion a ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('No fue posible enviar el correo de recuperacion.');
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
        attachments: [this.getLogoAttachment()],
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
          <td style="background-color:#951366;background-image:linear-gradient(135deg,#6d124f,#c73b8d);padding:32px 24px;text-align:center;">
            <div style="width:56px;height:56px;border-radius:50%;background-color:rgba(255,255,255,0.15);padding:8px;margin:0 auto 12px;"><img src="cid:paloma-logo" width="40" height="40" alt="Paloma Mensajera" style="display:block;width:40px;height:40px;object-fit:contain;" /></div>
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
            <div style="color:#951366;font-size:13px;font-weight:700;">PALOMA MENSAJERA</div>
            <div style="color:#9ca3af;font-size:12px;margin-top:4px;">Regalos con dedicatoria para la comunidad ECI.</div>
            <div style="color:#c1c5cb;font-size:11px;margin-top:12px;line-height:1.5;">Este es un correo automatico, por favor no respondas a este mensaje.<br>&copy; ${year} Paloma Mensajera &mdash; Todos los derechos reservados.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  }

  private getLogoAttachment(): nodemailer.Attachment {
    const sourcePath = join(__dirname, 'assets', 'paloma-mensajera.png');
    const builtPath = join(process.cwd(), 'dist', 'mailer', 'assets', 'paloma-mensajera.png');
    return {
      filename: 'paloma-mensajera.png',
      path: existsSync(sourcePath) ? sourcePath : builtPath,
      cid: 'paloma-logo',
    };
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
