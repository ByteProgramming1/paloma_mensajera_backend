import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// Argon2id (RFC 9106) - ver seccion 8 del SDD.
const ARGON2ID_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2ID_OPTIONS);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
