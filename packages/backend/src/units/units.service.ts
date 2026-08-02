import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUnitDto, actingUserId: string) {
    const unit = await this.prisma.unit.create({ data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Unit',
      entityId: unit.id,
      action: 'CREATE',
      after: unit,
    });

    return unit;
  }

  findAll() {
    return this.prisma.unit.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Unidad no encontrada');
    }

    return unit;
  }

  async update(id: string, dto: UpdateUnitDto, actingUserId: string) {
    const before = await this.findOne(id);
    const unit = await this.prisma.unit.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Unit',
      entityId: unit.id,
      action: 'UPDATE',
      before,
      after: unit,
    });

    return unit;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const unit = await this.prisma.unit.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Unit',
      entityId: unit.id,
      action: 'DEACTIVATE',
      before,
      after: unit,
    });

    return unit;
  }
}
