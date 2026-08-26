import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCustomerDto, actingUserId: string) {
    const customer = await this.prisma.customer.create({ data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Customer',
      entityId: customer.id,
      action: 'CREATE',
      after: customer,
    });

    return customer;
  }

  findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where: Prisma.CustomerWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};
    const orderBy = resolveOrderBy(sortBy, sortOrder, sortableFields, 'name');

    return paginate(
      () => this.prisma.customer.count({ where }),
      ({ skip, take }) =>
        this.prisma.customer.findMany({ where, orderBy, skip, take }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, actingUserId: string) {
    const before = await this.findOne(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Customer',
      entityId: customer.id,
      action: 'UPDATE',
      before,
      after: customer,
    });

    return customer;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Customer',
      entityId: customer.id,
      action: 'DEACTIVATE',
      before,
      after: customer,
    });

    return customer;
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
