import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateWarehouseDto, actingUserId: string) {
    const warehouse = await this.prisma.warehouse.create({ data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Warehouse',
      entityId: warehouse.id,
      action: 'CREATE',
      after: warehouse,
    });

    return warehouse;
  }

  findAll() {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto, actingUserId: string) {
    const before = await this.findOne(id);
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Warehouse',
      entityId: warehouse.id,
      action: 'UPDATE',
      before,
      after: warehouse,
    });

    return warehouse;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Warehouse',
      entityId: warehouse.id,
      action: 'DEACTIVATE',
      before,
      after: warehouse,
    });

    return warehouse;
  }
}
