import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const ENCRYPTED_PREFIX = 'enc:v1:';

const ENCRYPTED_FIELDS = new Set([
  'buyerFullName',
  'buyerEmail',
  'buyerPhone',
  'buyerCareerOrArea',
  'recipientFullName',
  'recipientCareerOrArea',
  'recipientTeamsUser',
  'deliveryNotes',
  'letterContent',
  'rejectionReason',
  'verificationNotes',
  'receivedBy',
  'teamsConfirmationLog',
  'notes',
]);

@Injectable()
export class DatabaseEncryptionService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const encodedKey = configService.get<string>('FIELD_ENCRYPTION_KEY');
    if (!encodedKey) {
      throw new Error('FIELD_ENCRYPTION_KEY es obligatorio para iniciar el backend.');
    }

    this.key = Buffer.from(encodedKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error(
        'FIELD_ENCRYPTION_KEY debe contener exactamente 64 caracteres hexadecimales.',
      );
    }
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}:${authTag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(ENCRYPTED_PREFIX)) {
      return value;
    }

    const [prefix, version, encodedIv, encodedAuthTag, encodedCiphertext] = value.split(':');
    if (
      prefix !== 'enc' ||
      version !== 'v1' ||
      !encodedIv ||
      !encodedAuthTag ||
      !encodedCiphertext
    ) {
      throw new BadRequestException('El valor cifrado tiene un formato invalido.');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(encodedIv, 'base64url'));
      decipher.setAuthTag(Buffer.from(encodedAuthTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new BadRequestException('No se pudo descifrar el valor almacenado.');
    }
  }

  transform(value: unknown, encrypt: boolean): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item, encrypt));
    }
    if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        ENCRYPTED_FIELDS.has(key) && typeof nestedValue === 'string'
          ? encrypt
            ? nestedValue.startsWith(ENCRYPTED_PREFIX)
              ? nestedValue
              : this.encrypt(nestedValue)
            : this.decrypt(nestedValue)
          : this.transform(nestedValue, encrypt),
      ]),
    );
  }

  extend<T extends { $extends: (...args: any[]) => any }>(client: T): T {
    const transform = this.transform.bind(this);
    return client.$extends({
      query: {
        $allModels: {
          async $allOperations({
            args,
            query,
          }: {
            args: unknown;
            query: (args: unknown) => unknown;
          }) {
            const encryptedArgs = transform(args, true);
            const result = await query(encryptedArgs);
            return transform(result, false);
          },
        },
      },
    }) as T;
  }
}
