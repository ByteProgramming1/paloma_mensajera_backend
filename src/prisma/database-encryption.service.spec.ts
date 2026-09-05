import { ConfigService } from '@nestjs/config';
import { DatabaseEncryptionService } from './database-encryption.service';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('DatabaseEncryptionService', () => {
  let service: DatabaseEncryptionService;

  beforeEach(() => {
    service = new DatabaseEncryptionService(new ConfigService({ FIELD_ENCRYPTION_KEY: KEY }));
  });

  it('cifra y descifra un valor sin guardar el texto plano', () => {
    const plaintext = 'ana@escuelaing.edu.co';
    const encrypted = service.encrypt(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('usa un IV nuevo para cada cifrado', () => {
    const first = service.encrypt('mismo valor');
    const second = service.encrypt('mismo valor');

    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe('mismo valor');
    expect(service.decrypt(second)).toBe('mismo valor');
  });

  it('cifra campos sensibles dentro de escrituras anidadas y los restaura al leer', () => {
    const data = {
      deliveryDetail: {
        buyerEmail: 'ana@escuelaing.edu.co',
        buyerPhone: '3001234567',
        letterContent: 'Feliz dia',
      },
      status: 'MESSAGE_PENDING_REVIEW',
    };

    const encrypted = service.transform(data, true) as typeof data;
    expect(encrypted.deliveryDetail.buyerEmail).toMatch(/^enc:v1:/);
    expect(encrypted.deliveryDetail.buyerPhone).toMatch(/^enc:v1:/);
    expect(encrypted.deliveryDetail.letterContent).toMatch(/^enc:v1:/);
    expect(encrypted.status).toBe(data.status);
    expect(service.transform(encrypted, false)).toEqual(data);
  });

  it('rechaza claves que no tienen 256 bits', () => {
    expect(
      () => new DatabaseEncryptionService(new ConfigService({ FIELD_ENCRYPTION_KEY: 'short' })),
    ).toThrow('64 caracteres hexadecimales');
  });

  it('aplica la transformacion al extender un cliente Prisma', async () => {
    let operation: (context: {
      args: unknown;
      query: (args: unknown) => Promise<unknown>;
    }) => Promise<unknown>;
    const client = {
      $extends(extension: { query: { $allModels: { $allOperations: typeof operation } } }) {
        operation = extension.query.$allModels.$allOperations;
        return this;
      },
    };

    service.extend(client);
    const query = jest.fn().mockResolvedValue({ buyerEmail: service.encrypt('persistido') });
    const result = await operation!({ args: { buyerEmail: 'ana@escuelaing.edu.co' }, query });

    expect(query).toHaveBeenCalledWith({ buyerEmail: expect.stringMatching(/^enc:v1:/) });
    expect(result).toEqual({ buyerEmail: 'persistido' });
  });
});
