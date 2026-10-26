import { Transform } from 'class-transformer';
import { isEmail, registerDecorator, ValidationOptions } from 'class-validator';

// El campo `email` de User es en realidad el identificador con el que se
// entra: un correo o un nombre de usuario simple ("herrajestoro"). La app
// de escritorio no tiene correo configurado, y obligar a inventar un correo
// solo para poder entrar confundía más de lo que ayudaba. El nombre del
// campo se mantiene (API, JWT, base) para no romper a nadie.
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export function isLoginIdentifier(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (isEmail(value) || USERNAME_PATTERN.test(value))
  );
}

export function IsLoginIdentifier(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isLoginIdentifier',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} debe ser un correo o un nombre de usuario (de 3 a 50 letras, números, punto, guion o guion bajo)`,
        ...validationOptions,
      },
      validator: { validate: isLoginIdentifier },
    });
  };
}

// Sin distinguir mayúsculas: "HerrajesToro" y "herrajestoro" son la misma
// cuenta. Se guarda y se busca siempre en minúsculas.
export function NormalizeLoginIdentifier() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}
