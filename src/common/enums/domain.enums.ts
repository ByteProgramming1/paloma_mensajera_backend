export enum OrderStatus {
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  PAYMENT_REJECTED = 'PAYMENT_REJECTED',
  IN_PREPARATION = 'IN_PREPARATION',
  IN_ROUTE = 'IN_ROUTE',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum SalesChannel {
  ONLINE = 'ONLINE',
  PRESENCIAL = 'PRESENCIAL',
}

export enum RaffleNumberStatus {
  AVAILABLE = 'AVAILABLE',
  ASSIGNED = 'ASSIGNED',
}

export enum ModerationMethod {
  KEYWORD_FILTER = 'KEYWORD_FILTER',
  AI = 'AI',
}

export enum PaymentMethod {
  NEQUI = 'NEQUI',
}

export enum ProductType {
  COMBO = 'COMBO',
  ADICIONAL = 'ADICIONAL',
}

export enum NotificationMode {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC',
}

export enum DeliveryAssignmentStatus {
  IN_ROUTE = 'IN_ROUTE',
  DELIVERED = 'DELIVERED',
  UNDELIVERED_RETRY = 'UNDELIVERED_RETRY',
  CANCELLED = 'CANCELLED',
}

export enum RoleSlug {
  ADMIN = 'admin',
  VERIFIER = 'verifier',
  SELLER = 'seller',
  DELIVERY = 'delivery',
}

// PostgreSQL es el motor principal; SQLite es la alternativa liviana para
// desarrollo local (ver DATABASE_PROVIDER y src/prisma/prisma.service.ts).
export enum DatabaseProvider {
  POSTGRESQL = 'postgresql',
  SQLITE = 'sqlite',
}
