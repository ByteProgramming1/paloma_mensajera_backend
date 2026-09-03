export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
  roleSlug: string;
  permissions: string[];
}
