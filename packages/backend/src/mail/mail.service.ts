import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

// Best-effort a propósito, mismo criterio que electron-updater (ver
// packages/desktop/electron/updater.ts): Opera es LAN-first, sin depender
// de internet para su función real. Si SMTP no está configurado o el envío
// falla, la app sigue funcionando igual — solo se pierde el correo puntual,
// nunca se propaga como un error que tumbe la request de quien lo pidió.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!(
      this.config.get<string>('SMTP_HOST') &&
      this.config.get<string>('SMTP_USER') &&
      this.config.get<string>('SMTP_PASSWORD')
    );
  }

  // Construido perezosamente (no en el constructor): la mayoría de
  // instalaciones de Opera nunca configuran SMTP, así que no tiene sentido
  // armar un transporter en cada arranque de la app para algo que puede no
  // usarse jamás.
  private getTransporter(): Transporter {
    this.transporter ??= createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT') ?? 587,
      secure: this.config.get<number>('SMTP_PORT') === 465,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASSWORD'),
      },
    });
    return this.transporter;
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `No se pudo enviar el código de recuperación a ${to}: SMTP no está configurado (SMTP_HOST/SMTP_USER/SMTP_PASSWORD).`,
      );
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from:
          this.config.get<string>('SMTP_FROM') ??
          'Opera <no-reply@opera.local>',
        to,
        subject: 'Código de verificación — Opera',
        text: `Tu código de verificación para restablecer la contraseña es: ${code}\n\nVence en 15 minutos. Si no pediste este cambio, ignora este correo.`,
        html: `<p>Tu código de verificación para restablecer la contraseña es:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>Vence en 15 minutos. Si no pediste este cambio, ignora este correo.</p>`,
      });
    } catch (error) {
      // Igual que AuditService.log(): quien llamó ya recibió (o va a
      // recibir) una respuesta genérica de éxito — un fallo de SMTP acá
      // nunca debe convertirse en un 500 para el usuario. Queda como warning
      // para que quien opera la instalación pueda notar el problema.
      this.logger.warn(
        `No se pudo enviar el código de recuperación a ${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
