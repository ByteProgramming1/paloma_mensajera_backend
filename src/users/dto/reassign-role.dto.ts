import { IsIn } from 'class-validator';
import { RoleSlug } from '../../common/enums/domain.enums';

// Rotacion de turnos (seccion 6 del SDD): solo los 3 roles operativos que
// rotan. Roles adicionales (dinamicos, o el legado `delivery`) se gestionan
// por separado via POST /roles + POST /auth/temporary-user.
const ROTATABLE_ROLES = [RoleSlug.ADMIN, RoleSlug.VERIFIER, RoleSlug.SELLER];

export class ReassignRoleDto {
  @IsIn(ROTATABLE_ROLES)
  newRole: RoleSlug;
}
