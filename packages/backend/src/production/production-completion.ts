import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';

type TransactionClient = Prisma.TransactionClient;

const logger = new Logger('ProductionCompletion');

export interface MaterialShortage {
  componentId: string;
  componentName: string;
  required: string;
  available: string;
}

export interface ProductionOrderToComplete {
  id: string;
  productId: string;
  warehouseId: string;
  // Lo planeado: lo que se consume de materiales si hay lista.
  quantity: Prisma.Decimal;
}

// Completa, dentro de la transacción del llamador, una orden de producción
// con lo que de verdad salió bueno (`producedQuantity`, ADR 0012): solo eso
// entra al inventario. La lista de materiales es opcional (ADR 0009): sin
// ella no se descuenta ninguna materia prima y el terminado entra sin costo
// propio. Con ella se consume lo planeado (las piezas dañadas también
// gastaron material) y el costo se reparte entre las buenas. Lo comparten
// ProductionOrdersService.complete (pestaña Producción) y
// OrdersService.markWarehoused (completar todo un pedido de una vez).
// El `updateMany` con `status: 'PENDIENTE'` es el guard atómico contra
// completar dos veces (ver #91).
export async function completeProductionOrderInTx(
  tx: TransactionClient,
  inventory: InventoryService,
  order: ProductionOrderToComplete,
  producedQuantity: Prisma.Decimal,
  reason: string,
  actingUserId: string,
): Promise<void> {
  const bom = await tx.billOfMaterials.findUnique({
    where: { productId: order.productId },
    include: { items: { include: { component: true } } },
  });

  let totalCost: Prisma.Decimal | null = null;
  if (bom && bom.isActive && bom.items.length > 0) {
    const componentIds = bom.items.map((item) => item.componentId);
    const [stockByComponent, costByComponent] = await Promise.all([
      inventory.getStockForProducts(componentIds, order.warehouseId, tx),
      inventory.getAverageCostForProducts(componentIds, order.warehouseId, tx),
    ]);
    const stockById = new Map(
      stockByComponent.map(({ productId, stock }) => [productId, stock]),
    );

    const shortages: MaterialShortage[] = [];
    const requirements = bom.items.map((item) => {
      const required = item.quantity.mul(order.quantity);
      const available =
        stockById.get(item.componentId) ?? new Prisma.Decimal(0);
      if (available.lessThan(required)) {
        shortages.push({
          componentId: item.componentId,
          componentName: item.component.name,
          required: required.toString(),
          available: available.toString(),
        });
      }
      // Costo promedio ponderado vigente del componente (ADR 0002).
      const unitCost =
        costByComponent.get(item.componentId) ?? new Prisma.Decimal(0);
      return { componentId: item.componentId, required, unitCost };
    });
    if (shortages.length > 0) {
      logger.warn(
        `Completado de la orden ${order.id} rechazado: ${shortages.length} material(es) sin stock suficiente`,
      );
      throw new BadRequestException({
        message:
          'Stock insuficiente de materias primas para completar esta orden',
        shortages,
      });
    }

    totalCost = requirements.reduce(
      (sum, requirement) =>
        sum.plus(requirement.unitCost.times(requirement.required)),
      new Prisma.Decimal(0),
    );
    await tx.stockMovement.createMany({
      data: requirements.map((requirement) => ({
        productId: requirement.componentId,
        warehouseId: order.warehouseId,
        type: 'SALIDA' as const,
        quantity: requirement.required.negated(),
        unitCost: requirement.unitCost,
        reason: `Consumo de materiales: ${reason}`,
        userId: actingUserId,
      })),
    });
  }

  const unitCost =
    totalCost && producedQuantity.greaterThan(0)
      ? totalCost.dividedBy(producedQuantity)
      : null;

  // Si todo salió dañado no entra nada.
  if (producedQuantity.greaterThan(0)) {
    await tx.stockMovement.create({
      data: {
        productId: order.productId,
        warehouseId: order.warehouseId,
        type: 'ENTRADA',
        quantity: producedQuantity,
        unitCost,
        reason,
        userId: actingUserId,
      },
    });
  }

  const result = await tx.productionOrder.updateMany({
    where: { id: order.id, status: 'PENDIENTE' },
    data: {
      status: 'COMPLETADA',
      completedAt: new Date(),
      producedQuantity,
      totalCost,
      unitCost,
    },
  });
  if (result.count === 0) {
    throw new ConflictException(
      'La orden cambió de estado antes de poder completarla, intenta de nuevo',
    );
  }
}

// Cuando ya no le quedan órdenes de producción pendientes, el pedido pasa
// solo a almacén (ADR 0012): no hay un "pasar a almacén" a mano. Devuelve
// si el pedido cambió de estado.
export async function warehouseOrderWhenProductionDone(
  tx: TransactionClient,
  orderId: string,
): Promise<boolean> {
  const pending = await tx.productionOrder.count({
    where: { orderId, status: 'PENDIENTE' },
  });
  if (pending > 0) {
    return false;
  }
  const result = await tx.order.updateMany({
    where: { id: orderId, status: 'EN_PRODUCCION' },
    data: { status: 'EN_ALMACEN', warehousedAt: new Date() },
  });
  return result.count > 0;
}
