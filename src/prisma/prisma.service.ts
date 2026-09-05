import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient as PostgresqlPrismaClient } from '../../prisma/postgresql/generated';
import { PrismaClient as SqlitePrismaClient } from '../../prisma/sqlite/generated';
import { DatabaseProvider } from '../common/enums/domain.enums';
import { DatabaseEncryptionService } from './database-encryption.service';

type AnyPrismaClient = PostgresqlPrismaClient | SqlitePrismaClient;

// Adaptador de base de datos: PostgreSQL es el motor principal; SQLite queda
// disponible como alternativa liviana para desarrollo local sin instalar nada
// (ver DATABASE_PROVIDER en .env). Cada motor tiene su propio schema.prisma
// y su propio cliente generado (prisma/postgresql y prisma/sqlite), porque
// Prisma fija el "provider" de un datasource en tiempo de generacion y no
// permite alternarlo en runtime dentro de un mismo cliente.
//
// Para que el resto de la aplicacion siga inyectando y usando `PrismaService`
// exactamente como un PrismaClient normal (this.prisma.order.findMany(...),
// this.prisma.$transaction(...)), esta clase envuelve el cliente activo en un
// Proxy que reenvia cualquier propiedad no declarada aqui hacia el, y expone
// su forma via "interface PrismaService extends PostgresqlPrismaClient"
// (fusion de declaraciones) para que TypeScript la reconozca en tiempo de
// compilacion. Se tipa contra el cliente de Postgres (motor principal); el de
// SQLite debe mantener exactamente el mismo modelo de datos (ver los dos
// schema.prisma) para que la forma en runtime coincida con este tipo.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface PrismaService extends PostgresqlPrismaClient {}

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: AnyPrismaClient;
  readonly provider: DatabaseProvider;

  constructor(configService: ConfigService) {
    const encryption = new DatabaseEncryptionService(configService);
    this.provider =
      (configService.get<string>('DATABASE_PROVIDER') as DatabaseProvider) ??
      DatabaseProvider.POSTGRESQL;

    const baseClient =
      this.provider === DatabaseProvider.SQLITE
        ? new SqlitePrismaClient({
            datasourceUrl: configService.get<string>('SQLITE_DATABASE_URL'),
          })
        : new PostgresqlPrismaClient({ datasourceUrl: configService.get<string>('DATABASE_URL') });
    this.client = encryption.extend(baseClient);

    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (property in target) {
          return Reflect.get(target, property, receiver);
        }
        return Reflect.get(target.client, property, target.client);
      },
    });
  }

  async onModuleInit() {
    this.logger.log(`Conectando a la base de datos (${this.provider})...`);
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
