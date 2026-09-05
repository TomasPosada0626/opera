import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

// El backend escucha en 0.0.0.0 (LAN-first, ver ADR 0007) pero
// POST /setup/admin crea la única cuenta de administrador de la
// instalación -- sin esto, cualquier dispositivo de la misma LAN puede
// ganarle la carrera al instalador legítimo en el primer arranque y quedarse
// con esa cuenta (auditoría 2026-09-01/2026-09-03, seguridad P2). El
// instalador autocontenido siempre corre Electron y el backend en la misma
// máquina (ver ADR 0008), así que esta restricción no rompe el flujo real.
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Injectable()
export class LoopbackOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.ip || !LOOPBACK_ADDRESSES.has(request.ip)) {
      throw new ForbiddenException(
        'Este endpoint solo se puede llamar desde la misma máquina.',
      );
    }
    return true;
  }
}
