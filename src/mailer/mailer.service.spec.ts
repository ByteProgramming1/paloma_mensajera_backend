import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ServiceUnavailableException } from '@nestjs/common';
import { MailerService } from './mailer.service';

jest.mock('nodemailer');

function throttledError(): Error {
  const error = new Error('Invalid greeting. response=421 4.4.5 Server busy, try again later.') as Error & {
    responseCode: number;
  };
  error.responseCode = 421;
  return error;
}

describe('MailerService', () => {
  const createTransport = nodemailer.createTransport as jest.Mock;
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
    sendMail = jest.fn();
    createTransport.mockReturnValue({ sendMail });
  });

  function buildService(): MailerService {
    return new MailerService(
      new ConfigService({
        SMTP_HOST: 'smtp.office365.com',
        SMTP_PORT: 587,
        SMTP_USER: 'no-reply@escuelaing.edu.co',
        SMTP_PASSWORD: 'secret',
      }),
    );
  }

  it('reintenta ante un 421 transitorio y envia en el siguiente intento', async () => {
    sendMail.mockRejectedValueOnce(throttledError()).mockResolvedValueOnce(undefined);
    const service = buildService();

    await service.sendVerificationCode('ana@escuelaing.edu.co', '123456', 'Ana');

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  it('agota los reintentos y lanza ServiceUnavailableException si el servidor sigue ocupado', async () => {
    sendMail.mockRejectedValue(throttledError());
    const service = buildService();

    await expect(
      service.sendVerificationCode('ana@escuelaing.edu.co', '123456', 'Ana'),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(sendMail).toHaveBeenCalledTimes(4);
  });

  it('no reintenta errores no transitorios (p.ej. credenciales invalidas)', async () => {
    const authError = new Error('Invalid login') as Error & { responseCode: number };
    authError.responseCode = 535;
    sendMail.mockRejectedValue(authError);
    const service = buildService();

    await expect(
      service.sendVerificationCode('ana@escuelaing.edu.co', '123456', 'Ana'),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('habilita pooling de conexiones en las opciones del transporter', async () => {
    sendMail.mockResolvedValue(undefined);
    const service = buildService();

    await service.sendVerificationCode('ana@escuelaing.edu.co', '123456', 'Ana');

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ pool: true, maxConnections: 3 }),
    );
  });
});
