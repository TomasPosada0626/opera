import { z } from 'zod';

// Mismo criterio que el backend (packages/backend/src/auth/
// login-identifier.ts): se entra con un correo o con un nombre de usuario
// simple ("herrajestoro"), sin distinguir mayúsculas.
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;
const emailSchema = z.email();

export function loginIdentifierSchema(emptyMessage = 'Ingresa tu usuario') {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(1, emptyMessage)
    .refine(
      (value) =>
        USERNAME_PATTERN.test(value) || emailSchema.safeParse(value).success,
      'Usa un correo o un usuario de 3 a 50 letras, números, punto o guion, sin espacios',
    );
}
