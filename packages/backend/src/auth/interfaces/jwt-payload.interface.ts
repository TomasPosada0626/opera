export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  // No se setea al firmar — jsonwebtoken lo agrega solo. Presente al decodificar.
  iat?: number;
}
