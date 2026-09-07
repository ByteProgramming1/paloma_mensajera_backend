// Matriz de permisos nucleares - ver seccion 5 del SDD.
export enum Permissions {
  ORDERS_CREATE_PUBLIC = 'orders:create_public',
  ORDERS_READ_ALL = 'orders:read_all',
  ORDERS_READ_PAYMENT_INFO = 'orders:read_payment_info',
  ORDERS_READ_PUBLIC_SAFE = 'orders:read_public_safe',
  ORDERS_READ_OWN = 'orders:read_own',
  ORDERS_VERIFY_PAYMENT = 'orders:verify_payment',
  ORDERS_ASSIGN_DELIVERY = 'orders:assign_delivery',
  ORDERS_UPDATE_DELIVERY = 'orders:update_delivery',
  MESSAGES_READ_QUEUE = 'messages:read_queue',
  MESSAGES_VERIFY = 'messages:verify',
  RAFFLE_SELECT_NUMBER = 'raffle:select_number',
  RAFFLE_DRAW_WINNER = 'raffle:draw_winner',
  PRODUCTS_MANAGE = 'products:manage',
  PRODUCTS_READ_ACTIVE = 'products:read_active',
  ROLES_MANAGE = 'roles:manage',
  USERS_MANAGE_TEMP = 'users:manage_temp',
  USERS_MANAGE_ROLES = 'users:manage_roles',
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
  { slug: Permissions.ORDERS_READ_OWN, resource: 'orders', action: 'read_own' },
  { slug: Permissions.ORDERS_VERIFY_PAYMENT, resource: 'orders', action: 'verify_payment' },
  { slug: Permissions.ORDERS_ASSIGN_DELIVERY, resource: 'orders', action: 'assign_delivery' },
  { slug: Permissions.ORDERS_UPDATE_DELIVERY, resource: 'orders', action: 'update_delivery' },
  { slug: Permissions.MESSAGES_READ_QUEUE, resource: 'messages', action: 'read_queue' },
  { slug: Permissions.MESSAGES_VERIFY, resource: 'messages', action: 'verify' },
  { slug: Permissions.RAFFLE_SELECT_NUMBER, resource: 'raffle', action: 'select_number' },
  { slug: Permissions.RAFFLE_DRAW_WINNER, resource: 'raffle', action: 'draw_winner' },
  { slug: Permissions.PRODUCTS_MANAGE, resource: 'products', action: 'manage' },
  { slug: Permissions.PRODUCTS_READ_ACTIVE, resource: 'products', action: 'read_active' },
  { slug: Permissions.ROLES_MANAGE, resource: 'roles', action: 'manage' },
  { slug: Permissions.USERS_MANAGE_TEMP, resource: 'users', action: 'manage_temp' },
  { slug: Permissions.USERS_MANAGE_ROLES, resource: 'users', action: 'manage_roles' },
];

// admin siempre recibe todos los permisos (ver 5.1 nota de visibilidad total del admin)
//
// El rol `verifier` ya no se mantiene en esta matriz (el SDD vigente lo elimina
// por completo: la revision de mensajes pasa al Vendedor y el pago queda como
// tarea exclusiva del Administrador, sin ningun alcance para el Vendedor). No
// se borra la fila de la base de datos si ya existe una cuenta con ese rol
// (evita romperla), pero el seed deja de otorgarle permisos.
//
// El rol `delivery` se mantiene igual, por la misma razon: ya no se usa para
// cuentas nuevas (fusionado en `seller`), pero no se elimina lo existente.
export const ROLE_PERMISSION_MATRIX: Record<string, Permissions[]> = {
  admin: PERMISSION_DEFINITIONS.map((p) => p.slug),
  // Vendedor: fusiona venta, entrega, y ahora tambien la revision manual de la
  // dedicatoria (antes del Verificador). Ya NO tiene orders:verify_payment:
  // la confirmacion de pago es exclusiva del Administrador, sin excepciones
  // ni alcance acotado (ver OrdersService.verifyPayment y HU-05 del SDD).
  seller: [
    Permissions.ORDERS_READ_PUBLIC_SAFE,
    Permissions.ORDERS_UPDATE_DELIVERY,
    Permissions.MESSAGES_READ_QUEUE,
    Permissions.MESSAGES_VERIFY,
    Permissions.PRODUCTS_READ_ACTIVE,
  ],
  delivery: [
    Permissions.ORDERS_READ_PUBLIC_SAFE,
    Permissions.ORDERS_UPDATE_DELIVERY,
    Permissions.PRODUCTS_READ_ACTIVE,
  ],
  comprador: [
    Permissions.ORDERS_CREATE_PUBLIC,
    // Le permite volver a consultar su propio pedido (GET /orders/:id) para
    // ver si la dedicatoria fue aprobada/rechazada o si ya tiene numero de
    // rifa, incluso despues de cerrar la pestana - ver OrdersService.findOneForUser.
    Permissions.ORDERS_READ_OWN,
    Permissions.RAFFLE_SELECT_NUMBER,
    Permissions.PRODUCTS_READ_ACTIVE,
  ],
};
