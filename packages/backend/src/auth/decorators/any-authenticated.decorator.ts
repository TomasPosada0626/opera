import { SetMetadata } from '@nestjs/common';

export const ANY_AUTHENTICATED_KEY = 'anyAuthenticated';

// No-op funcional para RbacGuard: ya deja pasar a cualquier usuario
// autenticado cuando la ruta no tiene @Roles/@Permissions (ver
// rbac.guard.ts). Este decorador no cambia ese comportamiento — existe
// solo para que "cualquier rol autenticado puede entrar acá" quede escrito
// a propósito en el controller, en vez de leerse como un @Roles/@Permissions
// olvidado (señalado en la auditoría 2026-08-28).
export const AnyAuthenticated = () => SetMetadata(ANY_AUTHENTICATED_KEY, true);
