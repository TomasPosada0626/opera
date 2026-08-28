import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
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
}
