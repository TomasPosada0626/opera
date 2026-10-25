import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertBillOfMaterialsDto } from './dto/upsert-bill-of-materials.dto';

type TransactionClient = Prisma.TransactionClient;
const bomInclude = {
  items: {
    include: {
      component: {
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          unit: { select: { id: true, name: true, abbreviation: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

// Lista de materiales de un producto terminado: qué materias primas e
// insumos lleva UNA unidad. La usan dos lugares para descontar stock solo:
// ProductionOrdersService.complete() y OrdersService.markWarehoused() (ADR
// 0009). Antes de este servicio no existía ninguna forma de crearla fuera
// de los fixtures de test, así que producción no se podía usar en una
// instalación real (auditoría ronda 6).
@Injectable()
export class BillOfMaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Sin lista todavía = items vacío (no 404): "este producto no tiene
  // lista" es un estado normal que la pantalla muestra, no un error.
  async findByProduct(productId: string) {
    await this.findProductOrThrow(productId);
    const bom = await this.prisma.billOfMaterials.findUnique({
      where: { productId },
      include: bomInclude,
    });

    return bom ?? { id: null, productId, isActive: false, items: [] };
  }

  async upsert(
    productId: string,
    dto: UpsertBillOfMaterialsDto,
    actingUserId: string,
  ) {
    const product = await this.findProductOrThrow(productId);
    if (product.type !== 'FINISHED_GOOD') {
      throw new BadRequestException(
        'Solo un producto terminado puede tener lista de materiales',
      );
    }
    if (!product.isActive) {
      throw new BadRequestException('El producto está desactivado');
    }

    const componentIds = dto.items.map((item) => item.componentId);
    if (new Set(componentIds).size !== componentIds.length) {
      throw new BadRequestException(
        'Un material no puede aparecer dos veces en la lista',
      );
    }
    if (componentIds.includes(productId)) {
      throw new BadRequestException(
        'Un producto no puede ser material de sí mismo',
      );
    }

    const components = await this.prisma.product.findMany({
      where: { id: { in: componentIds } },
    });
    const componentById = new Map(components.map((c) => [c.id, c]));
    for (const componentId of componentIds) {
      const component = componentById.get(componentId);
      if (!component) {
        throw new NotFoundException(`Material ${componentId} no encontrado`);
      }
      // Solo materias primas e insumos: un terminado dentro de otro
      // obligaría a descontar listas anidadas, que hoy nadie necesita.
      if (component.type === 'FINISHED_GOOD') {
        throw new BadRequestException(
          `${component.name} es un producto terminado; la lista solo admite materias primas e insumos`,
        );
      }
      if (!component.isActive) {
        throw new BadRequestException(`${component.name} está desactivado`);
      }
    }

    const before = await this.prisma.billOfMaterials.findUnique({
      where: { productId },
      include: { items: true },
    });

    const bom = await this.prisma.$transaction(
      async (tx: TransactionClient) => {
        const saved = await tx.billOfMaterials.upsert({
          where: { productId },
          create: { productId, isActive: true },
          update: { isActive: true },
        });
        await tx.billOfMaterialsItem.deleteMany({
          where: { billOfMaterialsId: saved.id },
        });
        await tx.billOfMaterialsItem.createMany({
          data: dto.items.map((item) => ({
            billOfMaterialsId: saved.id,
            componentId: item.componentId,
            quantity: item.quantity,
          })),
        });
        return tx.billOfMaterials.findUniqueOrThrow({
          where: { id: saved.id },
          include: bomInclude,
        });
      },
    );

    await this.audit.log({
      userId: actingUserId,
      entity: 'BillOfMaterials',
      entityId: bom.id,
      action: before ? 'UPDATE' : 'CREATE',
      before: before
        ? {
            productId,
            items: before.items.map(({ componentId, quantity }) => ({
              componentId,
              quantity,
            })),
          }
        : undefined,
      after: {
        productId,
        items: bom.items.map(({ componentId, quantity }) => ({
          componentId,
          quantity,
        })),
      },
    });

    return bom;
  }

  // Borra la lista (y sus líneas, onDelete: Cascade). Nada histórico la
  // referencia: las órdenes completadas y los pedidos en almacén ya
  // dejaron sus movimientos reales en el Kardex, y el AuditLog guarda cómo
  // era.
  async remove(productId: string, actingUserId: string) {
    const bom = await this.prisma.billOfMaterials.findUnique({
      where: { productId },
      include: { items: true },
    });
    if (!bom) {
      throw new NotFoundException('Este producto no tiene lista de materiales');
    }

    await this.prisma.billOfMaterials.delete({ where: { id: bom.id } });

    await this.audit.log({
      userId: actingUserId,
      entity: 'BillOfMaterials',
      entityId: bom.id,
      action: 'DELETE',
      before: {
        productId,
        items: bom.items.map(({ componentId, quantity }) => ({
          componentId,
          quantity,
        })),
      },
    });

    return { productId, deleted: true };
  }

  private async findProductOrThrow(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }
}
