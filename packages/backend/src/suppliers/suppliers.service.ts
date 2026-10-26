import { Injectable } from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  asCatalogDelegate,
  CatalogService,
} from '../common/catalog/catalog.service';
import { payableOf, receivedValueOf } from '../purchase-orders/payables';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class SuppliersService extends CatalogService<
  Supplier,
  CreateSupplierDto,
  UpdateSupplierDto
> {
  constructor(
    private readonly prisma: PrismaService,
    audit: AuditService,
  ) {
    super(asCatalogDelegate<Supplier>(prisma.supplier), audit, {
      entityName: 'Supplier',
      notFoundMessage: 'Proveedor no encontrado',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
      piiRedaction: {
        name: 'Proveedor eliminado',
        taxId: null,
        email: null,
        phone: null,
        address: null,
      },
    });
  }

  // Portabilidad de datos a pedido del titular (#33, auditoría) — perfil
  // completo + su lista de precios y su historial de compras propios, no
  // un reporte agregado.
  async exportExcel(id: string): Promise<Buffer> {
    const supplier = await this.findOne(id);
    const [supplierProducts, purchases] = await Promise.all([
      this.prisma.supplierProduct.findMany({
        where: { supplierId: id },
        include: { product: { select: { sku: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrderItem.findMany({
        where: { purchaseOrder: { supplierId: id } },
        include: {
          product: { select: { sku: true, name: true } },
          purchaseOrder: {
            select: { number: true, purchasedAt: true, status: true },
          },
        },
        orderBy: [
          { purchaseOrder: { purchasedAt: 'desc' } },
          { position: 'asc' },
        ],
      }),
    ]);

    const workbook = new Workbook();
    const profileSheet = workbook.addWorksheet('Proveedor');
    profileSheet.columns = [
      { header: 'Campo', key: 'field', width: 20 },
      { header: 'Valor', key: 'value', width: 40 },
    ];
    profileSheet.addRows([
      { field: 'Nombre', value: supplier.name },
      { field: 'NIT', value: supplier.taxId ?? '' },
      { field: 'Correo', value: supplier.email ?? '' },
      { field: 'Teléfono', value: supplier.phone ?? '' },
      { field: 'Dirección', value: supplier.address ?? '' },
      { field: 'Activo', value: supplier.isActive ? 'Sí' : 'No' },
      { field: 'Creado', value: supplier.createdAt.toISOString() },
    ]);

    const pricesSheet = workbook.addWorksheet('Precios');
    pricesSheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Producto', key: 'name', width: 30 },
      { header: 'Precio', key: 'price', width: 14 },
    ];
    pricesSheet.addRows(
      supplierProducts.map((sp) => ({
        sku: sp.product.sku,
        name: sp.product.name,
        price: sp.price.toNumber(),
      })),
    );

    const purchasesSheet = workbook.addWorksheet('Compras');
    purchasesSheet.columns = [
      { header: 'Compra No.', key: 'number', width: 12 },
      { header: 'Fecha', key: 'purchasedAt', width: 14 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Producto', key: 'name', width: 30 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Recibido', key: 'quantityReceived', width: 12 },
      { header: 'Costo unitario', key: 'unitCost', width: 16 },
    ];
    purchasesSheet.addRows(
      purchases.map((line) => ({
        number: line.purchaseOrder.number,
        purchasedAt: line.purchaseOrder.purchasedAt.toISOString().slice(0, 10),
        status: line.purchaseOrder.status,
        sku: line.product.sku,
        name: line.product.name,
        quantity: line.quantity.toNumber(),
        quantityReceived: line.quantityReceived.toNumber(),
        unitCost: line.unitCost.toNumber(),
      })),
    );

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // Lo que se le compró, recibió y pagó a este proveedor, y lo que se le
  // debe hoy (mismas reglas que el reporte de cuentas por pagar). Las
  // compras migradas sin control de pago y las canceladas no cuentan.
  async getBalance(id: string) {
    await this.findOne(id);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        supplierId: id,
        tracksPayment: true,
        status: { not: 'CANCELADA' },
      },
      select: {
        status: true,
        tracksPayment: true,
        total: true,
        amountPaid: true,
        items: { select: { quantityReceived: true, unitCost: true } },
      },
    });

    const zero = new Prisma.Decimal(0);
    return orders.reduce(
      (balance, order) => ({
        totalPurchased: balance.totalPurchased.plus(order.total),
        totalReceived: balance.totalReceived.plus(receivedValueOf(order.items)),
        totalPaid: balance.totalPaid.plus(order.amountPaid),
        payable: balance.payable.plus(payableOf(order)),
      }),
      {
        totalPurchased: zero,
        totalReceived: zero,
        totalPaid: zero,
        payable: zero,
      },
    );
  }
}
