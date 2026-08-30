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
  //
  // Deliberadamente sin paginar (#20, auditoría) a diferencia de
  // UsersService.findAll y el resto de los catálogos: este endpoint
  // alimenta un picker de checkboxes en UserForm, que necesita TODOS los
  // roles a la vez para poder marcarlos — paginarlo rompería ese caso de
  // uso real por seguir el patrón a ciegas.
  findAll() {
    return this.prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
