import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // Solo lectura — no hay CRUD de roles todavía porque no hay un caso de
  // uso real que lo pida (solo ADMIN existe, sembrado en `pnpm db:seed`,
  // ver PRODUCT.md: "no diseñar vistas para roles que aún no existen").
  // Esto solo lista lo que ya existe, para que la pantalla de Usuarios
  // (#96) pueda asignar roles sin adivinar sus ids.
  findAll() {
    return this.prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
