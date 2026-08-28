import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// JwtAuthGuard/RbacGuard son globales (ver app.module.ts) — un controller
// nuevo queda protegido por defecto sin que nadie tenga que acordarse de
// @UseGuards. @Public() es la única forma de abrir una ruta a propósito, y
// queda documentada en el propio código de esa ruta, no en la ausencia de
// un decorador.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
