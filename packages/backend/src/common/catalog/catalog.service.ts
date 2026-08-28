import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { ListQueryDto } from '../dto/list-query.dto';
import { paginate, resolveOrderBy } from '../pagination/paginate';

// Firma mínima que necesita CatalogService de un delegate de Prisma
// (this.prisma.category, this.prisma.customer, etc.) — deliberadamente más
// laxa que los tipos exactos que genera Prisma por modelo (Record<string,
// unknown> en vez de CategoryWhereInput/CategoryCreateInput/...), porque
// unificar 6 modelos distintos bajo una sola interfaz genérica no puede
// exigir la forma exacta de cada uno. La seguridad de tipos real sigue
// viviendo en el borde público: cada service concreto (CategoriesService,
// etc.) sigue tipando create()/update() contra su propio DTO, y el propio
// modelo Prisma sigue validando en runtime contra la base de datos.
interface CatalogDelegate<TEntity> {
  create(args: {
    data: Record<string, unknown>;
    include?: Record<string, unknown>;
  }): Promise<TEntity>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: Record<string, unknown>;
    skip: number;
    take: number;
    include?: Record<string, unknown>;
  }): Promise<TEntity[]>;
  findUnique(args: {
    where: { id: string };
    include?: Record<string, unknown>;
  }): Promise<TEntity | null>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
    include?: Record<string, unknown>;
  }): Promise<TEntity>;
}

// El delegate real de Prisma (this.prisma.category, ...) tiene un tipo
// mucho más rico y sobrecargado del que TypeScript no puede verificar
// estructuralmente contra la interfaz laxa de arriba sin un cast — este
// helper centraliza ese único punto de "confío en que el modelo real
// cumple esta forma", en vez de repetir `as unknown as` en cada una de las
// 6 subclases.
export function asCatalogDelegate<TEntity>(
  delegate: unknown,
): CatalogDelegate<TEntity> {
  return delegate as CatalogDelegate<TEntity>;
}

interface CatalogOptions {
  // Nombre de entidad tal como queda en AuditLog.entity (ej. 'Category').
  entityName: string;
  notFoundMessage: string;
  // Campos sobre los que buscar con `contains`/insensitive cuando viene
  // `search` en el query — varios campos se combinan con OR (ver Product).
  searchFields: string[];
  sortableFields: readonly string[];
  defaultSortField: string;
  include?: Record<string, unknown>;
}

// Base compartida para los 6 módulos de catálogo (Category, Unit,
// Warehouse, Customer, Supplier, Product) — antes eran ~100 líneas casi
// idénticas copiadas 6 veces (señalado en la auditoría de arquitectura).
// Cada subclase solo declara SU delegate de Prisma + sus opciones, y puede
// seguir agregando métodos propios (ver CustomersService.getBalance) sobre
// esta base sin heredar nada que no necesite.
export abstract class CatalogService<
  TEntity extends { id: string },
  TCreateDto extends object,
  TUpdateDto extends object,
> {
  protected constructor(
    private readonly delegate: CatalogDelegate<TEntity>,
    private readonly audit: AuditService,
    private readonly options: CatalogOptions,
  ) {}

  async create(dto: TCreateDto, actingUserId: string): Promise<TEntity> {
    const entity = await this.delegate.create({
      data: dto as Record<string, unknown>,
      include: this.options.include,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: this.options.entityName,
      entityId: entity.id,
      action: 'CREATE',
      after: entity,
    });

    return entity;
  }

  findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where = this.buildSearchWhere(search);
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      this.options.sortableFields,
      this.options.defaultSortField,
    );

    return paginate(
      () => this.delegate.count({ where }),
      ({ skip, take }) =>
        this.delegate.findMany({
          where,
          orderBy,
          skip,
          take,
          include: this.options.include,
        }),
      page,
      pageSize,
    );
  }

  async findOne(id: string): Promise<TEntity> {
    const entity = await this.delegate.findUnique({
      where: { id },
      include: this.options.include,
    });
    if (!entity) {
      throw new NotFoundException(this.options.notFoundMessage);
    }

    return entity;
  }

  async update(
    id: string,
    dto: TUpdateDto,
    actingUserId: string,
  ): Promise<TEntity> {
    const before = await this.findOne(id);
    const entity = await this.delegate.update({
      where: { id },
      data: dto as Record<string, unknown>,
      include: this.options.include,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: this.options.entityName,
      entityId: entity.id,
      action: 'UPDATE',
      before,
      after: entity,
    });

    return entity;
  }

  async deactivate(id: string, actingUserId: string): Promise<TEntity> {
    return this.setActive(id, false, 'DEACTIVATE', actingUserId);
  }

  // Antes no había vuelta atrás: una vez desactivado, ningún endpoint lo
  // reactivaba (señalado en la auditoría) — quedaba una vía sin retorno
  // por un error de un click o un cambio de opinión del negocio.
  async reactivate(id: string, actingUserId: string): Promise<TEntity> {
    return this.setActive(id, true, 'REACTIVATE', actingUserId);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    action: 'DEACTIVATE' | 'REACTIVATE',
    actingUserId: string,
  ): Promise<TEntity> {
    const before = await this.findOne(id);
    const entity = await this.delegate.update({
      where: { id },
      data: { isActive },
      include: this.options.include,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: this.options.entityName,
      entityId: entity.id,
      action,
      before,
      after: entity,
    });

    return entity;
  }

  private buildSearchWhere(search?: string): Record<string, unknown> {
    if (!search || this.options.searchFields.length === 0) {
      return {};
    }
    if (this.options.searchFields.length === 1) {
      return {
        [this.options.searchFields[0]]: {
          contains: search,
          mode: 'insensitive',
        },
      };
    }
    return {
      OR: this.options.searchFields.map((field) => ({
        [field]: { contains: search, mode: 'insensitive' },
      })),
    };
  }
}
