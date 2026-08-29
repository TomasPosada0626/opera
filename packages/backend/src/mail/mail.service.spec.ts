import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  let config: { get: jest.Mock };
  let service: MailService;
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    config = { get: jest.fn() };
    service = new MailService(config as unknown as ConfigService);
  });

  function withSmtpConfigured() {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_USER: 'notificaciones@example.com',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'Opera <notificaciones@example.com>',
      };
      return values[key];
    });
  }

  describe('isConfigured', () => {
    it('returns false when SMTP_HOST/SMTP_USER/SMTP_PASSWORD are missing', () => {
      config.get.mockReturnValue(undefined);
      expect(service.isConfigured()).toBe(false);
    });

    it('returns true when host, user and password are all set', () => {
      withSmtpConfigured();
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('sendPasswordResetCode', () => {
    it('does not throw and never calls nodemailer when SMTP is not configured', async () => {
      config.get.mockReturnValue(undefined);

      await expect(
        service.sendPasswordResetCode('user@opera.local', '123456'),
      ).resolves.toBeUndefined();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('sends the code via nodemailer when SMTP is configured', async () => {
      withSmtpConfigured();

      await service.sendPasswordResetCode('user@opera.local', '123456');

      const [[mailArgs]] = sendMail.mock.calls as [
        { to: string; subject: string; text: string },
      ][];
      expect(mailArgs.to).toBe('user@opera.local');
      expect(mailArgs.subject).toContain('Código');
      expect(mailArgs.text).toContain('123456');
    });

    it('does not throw when nodemailer.sendMail rejects', async () => {
      withSmtpConfigured();
      sendMail.mockRejectedValue(new Error('connection refused'));

      await expect(
        service.sendPasswordResetCode('user@opera.local', '123456'),
      ).resolves.toBeUndefined();
    });

    it('reuses the same transporter across multiple sends', async () => {
      withSmtpConfigured();

      await service.sendPasswordResetCode('a@opera.local', '111111');
      await service.sendPasswordResetCode('b@opera.local', '222222');

      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    });

    // El redact de pino-http (app.module.ts) no cubre logs manuales — sin
    // esto, logs/opera-backend.log terminaría siendo en la práctica un
    // padrón de correos reales (señalado en la auditoría 2026-08-28).
    it('never logs the raw email — masks it in the "SMTP not configured" warning', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockReturnValue();
      config.get.mockReturnValue(undefined);

      await service.sendPasswordResetCode('juan.perez@opera.local', '123456');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('j*********@opera.local'),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('juan.perez@opera.local'),
      );
      warnSpy.mockRestore();
    });

    it('never logs the raw email — masks it in the send-failure warning', async () => {
      withSmtpConfigured();
      sendMail.mockRejectedValue(new Error('connection refused'));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockReturnValue();

      await service.sendPasswordResetCode('juan.perez@opera.local', '123456');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('j*********@opera.local'),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('juan.perez@opera.local'),
      );
      warnSpy.mockRestore();
    });
  });
});
