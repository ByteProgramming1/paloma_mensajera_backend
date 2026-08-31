// Matriz de permisos nucleares - ver seccion 5 del SDD.
export enum Permissions {
  ORDERS_CREATE_PUBLIC = 'orders:create_public',
  ORDERS_READ_ALL = 'orders:read_all',
  ORDERS_READ_PAYMENT_INFO = 'orders:read_payment_info',
  ORDERS_READ_PUBLIC_SAFE = 'orders:read_public_safe',
  ORDERS_VERIFY_PAYMENT = 'orders:verify_payment',
  ORDERS_ASSIGN_DELIVERY = 'orders:assign_delivery',
  ORDERS_UPDATE_DELIVERY = 'orders:update_delivery',
  RAFFLE_SELECT_NUMBER = 'raffle:select_number',
  RAFFLE_DRAW_WINNER = 'raffle:draw_winner',
  PRODUCTS_MANAGE = 'products:manage',
  PRODUCTS_READ_ACTIVE = 'products:read_active',
  ROLES_MANAGE = 'roles:manage',
  USERS_MANAGE_TEMP = 'users:manage_temp',
}

export const PERMISSION_DEFINITIONS: Array<{
  slug: Permissions;
  resource: string;
  action: string;
}> = [
  { slug: Permissions.ORDERS_CREATE_PUBLIC, resource: 'orders', action: 'create_public' },
  { slug: Permissions.ORDERS_READ_ALL, resource: 'orders', action: 'read_all' },
  { slug: Permissions.ORDERS_READ_PAYMENT_INFO, resource: 'orders', action: 'read_payment_info' },
  { slug: Permissions.ORDERS_READ_PUBLIC_SAFE, resource: 'orders', action: 'read_public_safe' },
  { slug: Permissions.ORDERS_VERIFY_PAYMENT, resource: 'orders', action: 'verify_payment' },
  { slug: Permissions.ORDERS_ASSIGN_DELIVERY, resource: 'orders', action: 'assign_delivery' },
  { slug: Permissions.ORDERS_UPDATE_DELIVERY, resource: 'orders', action: 'update_delivery' },
  { slug: Permissions.RAFFLE_SELECT_NUMBER, resource: 'raffle', action: 'select_number' },
  { slug: Permissions.RAFFLE_DRAW_WINNER, resource: 'raffle', action: 'draw_winner' },
  { slug: Permissions.PRODUCTS_MANAGE, resource: 'products', action: 'manage' },
  { slug: Permissions.PRODUCTS_READ_ACTIVE, resource: 'products', action: 'read_active' },
  { slug: Permissions.ROLES_MANAGE, resource: 'roles', action: 'manage' },
  { slug: Permissions.USERS_MANAGE_TEMP, resource: 'users', action: 'manage_temp' },
];

// admin siempre recibe todos los permisos (ver 5.1 nota de visibilidad total del admin)
export const ROLE_PERMISSION_MATRIX: Record<string, Permissions[]> = {
  admin: PERMISSION_DEFINITIONS.map((p) => p.slug),
  verifier: [Permissions.ORDERS_READ_PAYMENT_INFO, Permissions.ORDERS_VERIFY_PAYMENT],
  seller: [Permissions.ORDERS_READ_PUBLIC_SAFE, Permissions.PRODUCTS_READ_ACTIVE],
  delivery: [
    Permissions.ORDERS_READ_PUBLIC_SAFE,
    Permissions.ORDERS_UPDATE_DELIVERY,
    Permissions.PRODUCTS_READ_ACTIVE,
  ],
  comprador: [
    Permissions.ORDERS_CREATE_PUBLIC,
    Permissions.RAFFLE_SELECT_NUMBER,
    Permissions.PRODUCTS_READ_ACTIVE,
  ],
};
