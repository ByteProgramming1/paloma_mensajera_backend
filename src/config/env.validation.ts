import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // PostgreSQL es el motor principal; SQLite queda como alternativa liviana
  // para desarrollo local (ver src/prisma/prisma.service.ts).
  DATABASE_PROVIDER: Joi.string().valid('postgresql', 'sqlite').default('postgresql'),
  DATABASE_URL: Joi.string().when('DATABASE_PROVIDER', {
    is: 'postgresql',
    then: Joi.required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  SQLITE_DATABASE_URL: Joi.string().default('file:./dev.db'),
  JWT_SECRET: Joi.string().min(16).required(),
  // Origenes permitidos para CORS, separados por coma (ej. el dominio de
  // Vercel del frontend en produccion). Sin definir, acepta cualquier origin
  // (ver src/main.ts) - asi funciona el desarrollo local sin configurar nada.
  CORS_ORIGIN: Joi.string().allow('').optional(),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:4200'),
  FIELD_ENCRYPTION_KEY: Joi.string()
    .pattern(/^[0-9a-fA-F]{64}$/)
    .required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(20),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().allow('').optional(),
  GMAIL: Joi.string().email().allow('').optional(),
  ID_CLIENTE: Joi.string().allow('').optional(),
  SECRETO_CLIENTE: Joi.string().allow('').optional(),
  GOOGLE_REFRESH_TOKEN: Joi.string().allow('').optional(),
  // Uno o varios dominios institucionales separados por coma, ej.
  // "escuelaing.edu.co,mail.escuelaing.edu.co" (profesores vs. estudiantes).
  INSTITUTIONAL_EMAIL_DOMAIN: Joi.string().required(),
  NOTIFICATION_MODE: Joi.string().valid('MANUAL', 'AUTOMATIC').default('MANUAL'),
  GRAPH_TENANT_ID: Joi.string().allow('').optional(),
  GRAPH_CLIENT_ID: Joi.string().allow('').optional(),
  GRAPH_CLIENT_SECRET: Joi.string().allow('').optional(),
  GRAPH_API_SCOPE: Joi.string().allow('').optional(),

  // Inicio de sesion con cuenta institucional de Microsoft (Entra ID / Azure AD).
  // App registration de tipo SPA/publico usada por el frontend con MSAL para
  // obtener un id_token, que este backend valida contra el JWKS del tenant.
  AZURE_AD_TENANT_ID: Joi.string().allow('').optional(),
  AZURE_AD_CLIENT_ID: Joi.string().allow('').optional(),

  ADMIN_SEED_EMAIL: Joi.string().email().optional(),
  ADMIN_SEED_PASSWORD: Joi.string().min(8).optional(),
  RAFFLE_NUMBER_COUNT: Joi.number().integer().min(1).default(100),

  // Almacenamiento de imagenes del catalogo (seccion 9 del SDD). LOCAL_FILESYSTEM
  // funciona sin configurar nada mas (sirve /uploads desde el propio backend);
  // AZURE_BLOB sube a un contenedor de Azure Blob Storage (ver
  // AZURE_STORAGE_*); S3_COMPATIBLE queda declarado para un bucket S3 real,
  // pero no esta implementado.
  IMAGE_STORAGE_PROVIDER: Joi.string()
    .valid('LOCAL_FILESYSTEM', 'AZURE_BLOB', 'S3_COMPATIBLE')
    .default('LOCAL_FILESYSTEM'),
  IMAGE_BUCKET_NAME: Joi.string().allow('').optional(),
  IMAGE_BUCKET_ACCESS_KEY: Joi.string().allow('').optional(),
  IMAGE_BUCKET_SECRET_KEY: Joi.string().allow('').optional(),
  // Azure Portal -> Storage account -> Security + networking -> Access keys
  // -> "Connection string" (incluye cuenta y llave, no hace falta separarlos).
  AZURE_STORAGE_CONNECTION_STRING: Joi.string().allow('').optional(),
  AZURE_STORAGE_CONTAINER_NAME: Joi.string().allow('').optional(),
  IMAGE_MAX_SIZE_MB: Joi.number().integer().min(1).default(5),
});
