import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';

const orderInclude = { product: true, warehouse: true };
const sortableFields = ['createdAt', 'status'] as const;

interface Shortage {
  componentId: string;
  componentName: string;
  required: string;
  available: string;
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  findAll(query: ListQueryDto) {
    const { page = 1, pageSize = 20, sortBy, sortOrder = 'desc' } = query;
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'createdAt',
    );

    return paginate(
      () => this.prisma.productionOrder.count(),
      ({ skip, take }) =>
        this.prisma.productionOrder.findMany({
          include: orderInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }

    return order;
  }

  // Valida disponibilidad de materiales al momento de crear la orden, pero no
  // reserva/bloquea stock — es informativo, no una garantía. La orden en sí
  // no mueve nada (StockMovement solo se crea al completarla, #33), así que
  // no hay nada que proteger con una transacción aquí: la validación real
  // contra sobregiro vive en el completar, con el mismo patrón Serializable
  // que ya usan salidas y ajustes (ver ADR 0001).
  async create(dto: CreateProductionOrderDto, actingUserId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    if (product.type !== 'FINISHED_GOOD') {
      throw new BadRequestException(
        'Solo se pueden crear órdenes de producción para productos terminados',
      );
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    const bom = await this.prisma.billOfMaterials.findUnique({
      where: { productId: dto.productId },
      include: { items: { include: { component: true } } },
    });
    if (!bom || !bom.isActive || bom.items.length === 0) {
      throw new BadRequestException(
        'Este producto no tiene una receta activa configurada',
      );
    }

    const shortages: Shortage[] = [];
    for (const item of bom.items) {
      const required = item.quantity.mul(dto.quantity);
      const available = await this.inventory.getStock(
        item.componentId,
        dto.warehouseId,
      );
      if (available.lessThan(required)) {
        shortages.push({
          componentId: item.componentId,
          componentName: item.component.name,
          required: required.toString(),
          available: available.toString(),
        });
      }
    }
    if (shortages.length > 0) {
      throw new BadRequestException({
        message: 'Stock insuficiente de materias primas para esta orden',
        shortages,
      });
    }

    const order = await this.prisma.productionOrder.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        userId: actingUserId,
      },
      include: orderInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'ProductionOrder',
      entityId: order.id,
      action: 'CREATE',
      after: order,
    });

    return order;
  }
}
