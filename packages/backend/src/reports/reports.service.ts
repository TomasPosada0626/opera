import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // Intervalo semiabierto [from, to) — evita adivinar si `to` debe incluir
  // ese día completo o no; el llamador manda el inicio del día siguiente si
  // quiere ese día incluido.
  private dateRangeWhere(
    query: DateRangeQueryDto,
  ): Prisma.DateTimeFilter | undefined {
    if (!query.from && !query.to) {
      return undefined;
    }
    return {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lt: new Date(query.to) } : {}),
    };
  }

  // Mismo patrón de groupBy que InventoryService.getLowStockProducts, pero
  // sobre TODOS los productos activos, no solo los que tienen minStock
  // configurado — este es el inventario completo, no una alerta. El costo
  // promedio (ver ADR 0002) se reutiliza de InventoryService en vez de
  // reimplementar el recorrido cronológico del ledger; N llamadas está bien
  // acá porque esto es un reporte (catálogo de una PyME, no un endpoint
  // caliente), no el flujo de crear un movimiento.
  async getInventoryReport() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, unit: true },
      orderBy: { name: 'asc' },
    });
    if (products.length === 0) {
      return [];
    }

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((product) => product.id) } },
      _sum: { quantity: true },
    });
    const stockByProduct = new Map(
      grouped.map(({ productId, _sum }) => [
        productId,
        _sum.quantity ?? new Prisma.Decimal(0),
      ]),
    );

    return Promise.all(
      products.map(async (product) => {
        const stock = stockByProduct.get(product.id) ?? new Prisma.Decimal(0);
        const averageCost = await this.inventory.getAverageCost(product.id);

        return {
          id: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category.name,
          unit: product.unit.name,
          stock,
          averageCost,
          stockValue: stock.times(averageCost),
        };
      }),
    );
  }

  // Los pedidos CANCELADO no cuentan como venta real (todavía no hay
  // endpoint para cancelar uno, pero el schema ya contempla el estado — no
  // hay razón para que este reporte deje de ser correcto el día que exista).
  // El total se recorre en JS con Prisma.Decimal (mismo espíritu que
  // orderTotal en el frontend) porque quantity * unitPrice no es algo que
  // Prisma pueda sumar con un _sum de groupBy.
  async getSalesReport(query: DateRangeQueryDto) {
    const createdAt = this.dateRangeWhere(query);
    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: 'CANCELADO' },
        ...(createdAt ? { createdAt } : {}),
      },
      include: { items: true },
    });

    let totalQuantity = new Prisma.Decimal(0);
    let totalRevenue = new Prisma.Decimal(0);
    for (const order of orders) {
      for (const item of order.items) {
        totalQuantity = totalQuantity.plus(item.quantity);
        totalRevenue = totalRevenue.plus(item.quantity.times(item.unitPrice));
      }
    }

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      orderCount: orders.length,
      totalQuantity,
      totalRevenue,
    };
  }

  // Ranking de productos por cantidad vendida — 'desc' (más vendidos) o
  // 'asc' (menos vendidos), pedido explícitamente para el Dashboard (nota de
  // visión M5). Se agrega en memoria por la misma razón que getSalesReport:
  // el "vendido" real es quantity, pero el ranking también carga revenue
  // para que el frontend no tenga que pedir los dos reportes por separado.
  async getTopProducts(query: TopProductsQueryDto) {
    const createdAt = this.dateRangeWhere(query);
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: { not: 'CANCELADO' },
          ...(createdAt ? { createdAt } : {}),
        },
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    const byProduct = new Map<
      string,
      {
        product: { id: string; sku: string; name: string };
        quantitySold: Prisma.Decimal;
        revenue: Prisma.Decimal;
      }
    >();
    for (const item of items) {
      const existing = byProduct.get(item.productId) ?? {
        product: item.product,
        quantitySold: new Prisma.Decimal(0),
        revenue: new Prisma.Decimal(0),
      };
      existing.quantitySold = existing.quantitySold.plus(item.quantity);
      existing.revenue = existing.revenue.plus(
        item.quantity.times(item.unitPrice),
      );
      byProduct.set(item.productId, existing);
    }

    const sortOrder = query.sortOrder ?? 'desc';
    const ranked = Array.from(byProduct.values())
      .map(({ product, quantitySold, revenue }) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantitySold,
        revenue,
      }))
      .sort((a, b) =>
        sortOrder === 'desc'
          ? b.quantitySold.comparedTo(a.quantitySold)
          : a.quantitySold.comparedTo(b.quantitySold),
      );

    return ranked.slice(0, query.limit ?? 10);
  }

  // Los tres exports reusan el mismo cálculo que su reporte en JSON (nunca
  // reimplementan la consulta) — la hoja de Excel es solo otra
  // presentación de los mismos números, no una fuente de verdad aparte.
  async getInventoryExcel(): Promise<Buffer> {
    const rows = await this.getInventoryReport();

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Inventario');
    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Categoría', key: 'category', width: 20 },
      { header: 'Unidad', key: 'unit', width: 12 },
      { header: 'Stock', key: 'stock', width: 12 },
      { header: 'Costo promedio', key: 'averageCost', width: 16 },
      { header: 'Valor en stock', key: 'stockValue', width: 16 },
    ];
    sheet.addRows(
      rows.map((row) => ({
        sku: row.sku,
        name: row.name,
        category: row.category,
        unit: row.unit,
        stock: row.stock.toNumber(),
        averageCost: row.averageCost.toNumber(),
        stockValue: row.stockValue.toNumber(),
      })),
    );

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async getSalesExcel(query: DateRangeQueryDto): Promise<Buffer> {
    const report = await this.getSalesReport(query);

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Ventas');
    sheet.columns = [
      { header: 'Desde', key: 'from', width: 14 },
      { header: 'Hasta', key: 'to', width: 14 },
      { header: 'Pedidos', key: 'orderCount', width: 12 },
      { header: 'Cantidad total', key: 'totalQuantity', width: 16 },
      { header: 'Ingresos totales', key: 'totalRevenue', width: 18 },
    ];
    sheet.addRow({
      from: report.from ?? '',
      to: report.to ?? '',
      orderCount: report.orderCount,
      totalQuantity: report.totalQuantity.toNumber(),
      totalRevenue: report.totalRevenue.toNumber(),
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async getTopProductsExcel(query: TopProductsQueryDto): Promise<Buffer> {
    const rows = await this.getTopProducts(query);

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Productos más vendidos');
    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Cantidad vendida', key: 'quantitySold', width: 18 },
      { header: 'Ingresos', key: 'revenue', width: 16 },
    ];
    sheet.addRows(
      rows.map((row) => ({
        sku: row.sku,
        name: row.name,
        quantitySold: row.quantitySold.toNumber(),
        revenue: row.revenue.toNumber(),
      })),
    );

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
