import * as argon2 from 'argon2';

// Explícitos, no los defaults implícitos de la librería — un futuro bump de
// `argon2` podría cambiar sus defaults en cualquier dirección sin que nadie
// lo note. Valores iguales a los defaults actuales de argon2@0.45 (ver
// node_modules/argon2/argon2.cjs), así que fijarlos no cambia el hash de
// ningún usuario existente ni exige rehash. Compartido entre UsersService
// (hashea passwords reales) y AuthService (hashea el señuelo del login).
export const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;
