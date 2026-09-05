import { IsIn } from 'class-validator';
import { RoleSlug } from '../../common/enums/domain.enums';

// Rotacion de turnos (seccion 7 del SDD vigente): el rol `verifier` ya no
// existe como rol operativo, asi que ahora solo hay dos roles rotables. Roles
// adicionales (dinamicos, o el legado `delivery`) se gestionan por separado
// via POST /roles + POST /auth/temporary-user.
const ROTATABLE_ROLES = [RoleSlug.ADMIN, RoleSlug.SELLER];

export class ReassignRoleDto {
  @IsIn(ROTATABLE_ROLES)
  newRole: RoleSlug;
}
