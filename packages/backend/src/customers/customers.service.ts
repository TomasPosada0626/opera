import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  asCatalogDelegate,
  CatalogService,
} from '../common/catalog/catalog.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class CustomersService extends CatalogService<
  Customer,
  CreateCustomerDto,
  UpdateCustomerDto
> {
  constructor(
    private readonly prisma: PrismaService,
    audit: AuditService,
  ) {
    super(asCatalogDelegate<Customer>(prisma.customer), audit, {
      entityName: 'Customer',
      notFoundMessage: 'Cliente no encontrado',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
      piiRedaction: {
        name: 'Cliente eliminado',
        taxId: null,
        email: null,
        phone: null,
        address: null,
      },
    });
  }

  // Saldo pendiente = lo remisionado (lo que de verdad se despachó, no lo
  // pedido — un pedido sin despachar todavía no es un cobro pendiente)
  // menos lo pagado. "Lo pagado" por remisión sale de paymentStatus:
  // PAGADO = el valor completo de esa remisión, ABONADO = amountPaid,
  // CARTERA = nada — nunca un campo propio, se deriva en cada consulta
  // (mismo espíritu que el stock del Kardex).
  async getBalance(customerId: string) {
    await this.findOne(customerId);

    const remissions = await this.prisma.remission.findMany({
      where: { order: { customerId } },
      include: { items: { include: { orderItem: true } } },
    });

    let totalBilled = new Prisma.Decimal(0);
    let totalPaid = new Prisma.Decimal(0);

    for (const remission of remissions) {
      const value = remission.items.reduce(
        (sum, item) => sum.plus(item.quantity.times(item.orderItem.unitPrice)),
        new Prisma.Decimal(0),
      );
      totalBilled = totalBilled.plus(value);

      if (remission.paymentStatus === 'PAGADO') {
        totalPaid = totalPaid.plus(value);
      } else if (remission.paymentStatus === 'ABONADO') {
        totalPaid = totalPaid.plus(
          remission.amountPaid ?? new Prisma.Decimal(0),
        );
      }
    }

    return {
      totalBilled: totalBilled.toString(),
      totalPaid: totalPaid.toString(),
      balance: totalBilled.minus(totalPaid).toString(),
    };
  }

  // Portabilidad de datos a pedido del titular (#33, auditoría) — perfil
  // completo + su historial de pedidos propio, no un reporte agregado como
  // los de ReportsService. El total de cada pedido se recalcula igual que
  // orderTotal en el frontend (quantity * unitPrice no es un _sum que
  // Prisma pueda hacer solo, mismo motivo que ReportsService.getSalesReport).
  async exportExcel(id: string): Promise<Buffer> {
    const customer = await this.findOne(id);
    const orders = await this.prisma.order.findMany({
      where: { customerId: id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new Workbook();
    const profileSheet = workbook.addWorksheet('Cliente');
    profileSheet.columns = [
      { header: 'Campo', key: 'field', width: 20 },
      { header: 'Valor', key: 'value', width: 40 },
    ];
    profileSheet.addRows([
      { field: 'Nombre', value: customer.name },
      { field: 'NIT', value: customer.taxId ?? '' },
      { field: 'Correo', value: customer.email ?? '' },
      { field: 'Teléfono', value: customer.phone ?? '' },
      { field: 'Dirección', value: customer.address ?? '' },
      { field: 'Activo', value: customer.isActive ? 'Sí' : 'No' },
      { field: 'Creado', value: customer.createdAt.toISOString() },
    ]);

    const ordersSheet = workbook.addWorksheet('Pedidos');
    ordersSheet.columns = [
      { header: 'Fecha', key: 'createdAt', width: 14 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Líneas', key: 'itemCount', width: 10 },
      { header: 'Total', key: 'total', width: 14 },
    ];
    ordersSheet.addRows(
      orders.map((order) => ({
        createdAt: order.createdAt.toISOString().slice(0, 10),
        status: order.status,
        itemCount: order.items.length,
        total: order.items.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
          0,
        ),
      })),
    );

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
