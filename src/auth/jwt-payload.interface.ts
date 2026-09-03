export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  roleSlug: string;
  permissions: string[];
}
