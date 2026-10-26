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
        mobile: null,
      },
    });
  }

  // Saldo pendiente = lo remisionado (lo que de verdad se despachó, no lo
  // pedido — un pedido sin despachar todavía no es un cobro pendiente)
  // menos lo abonado, ambos solo de remisiones NO anuladas: una remisión
  // anulada ya devolvió su mercancía al stock y no se le cobra a nadie
  // (antes se sumaban igual, inflando el saldo — auditoría ronda 6).
  // total/amountPaid de cada remisión los mantiene RemissionsService a
  // partir de los abonos, así que acá alcanza con un aggregate.
  async getBalance(customerId: string) {
    await this.findOne(customerId);

    const { _sum } = await this.prisma.remission.aggregate({
      where: { order: { customerId }, voidedAt: null },
      _sum: { total: true, amountPaid: true },
    });
    const totalBilled = _sum.total ?? new Prisma.Decimal(0);
    const totalPaid = _sum.amountPaid ?? new Prisma.Decimal(0);

    return {
      totalBilled: totalBilled.toString(),
      totalPaid: totalPaid.toString(),
      balance: totalBilled.minus(totalPaid).toString(),
    };
  }

  // Historial de abonos del cliente en todas sus remisiones, del más
  // reciente al más viejo — incluye los anulados (con su motivo) porque el
  // historial es justamente para poder explicar cualquier diferencia.
  async getPayments(customerId: string) {
    await this.findOne(customerId);

    return this.prisma.remissionPayment.findMany({
      where: { remission: { order: { customerId } } },
      include: {
        remission: { select: { id: true, number: true, orderId: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { paidAt: 'desc' },
    });
  }

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
      { field: 'Ciudad', value: customer.city ?? '' },
      { field: 'País', value: customer.country ?? '' },
      { field: 'Celular', value: customer.mobile ?? '' },
      { field: 'Zona', value: customer.zone ?? '' },
      { field: 'Asesor', value: customer.salesRep ?? '' },
      { field: 'Condiciones de pago', value: customer.paymentTerms ?? '' },
      { field: 'Activo', value: customer.isActive ? 'Sí' : 'No' },
      { field: 'Creado', value: customer.createdAt.toISOString() },
    ]);

    const ordersSheet = workbook.addWorksheet('Pedidos');
    ordersSheet.columns = [
      { header: 'No.', key: 'number', width: 8 },
      { header: 'Fecha', key: 'createdAt', width: 14 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Líneas', key: 'itemCount', width: 10 },
      { header: 'Total', key: 'total', width: 14 },
    ];
    ordersSheet.addRows(
      orders.map((order) => ({
        number: order.number,
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
