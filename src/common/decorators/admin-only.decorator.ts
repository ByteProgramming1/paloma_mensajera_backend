import { SetMetadata } from '@nestjs/common';

// Para endpoints cuyo permiso requerido en el SDD es directamente el rol "admin"
// (seccion 9: /settings/notification-mode y /metrics/summary), en lugar de un
// permiso nuclear especifico de la matriz de la seccion 5.
export const ADMIN_ONLY_KEY = 'adminOnly';
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);
