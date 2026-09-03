import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(20),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  INSTITUTIONAL_EMAIL_DOMAIN: Joi.string().required(),
  NOTIFICATION_MODE: Joi.string().valid('MANUAL', 'AUTOMATIC').default('MANUAL'),
  GRAPH_TENANT_ID: Joi.string().allow('').optional(),
  GRAPH_CLIENT_ID: Joi.string().allow('').optional(),
  GRAPH_CLIENT_SECRET: Joi.string().allow('').optional(),
  GRAPH_API_SCOPE: Joi.string().allow('').optional(),
  ADMIN_SEED_EMAIL: Joi.string().email().optional(),
  ADMIN_SEED_PASSWORD: Joi.string().min(8).optional(),
  RAFFLE_NUMBER_COUNT: Joi.number().integer().min(1).default(100),
});
