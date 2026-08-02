import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productInclude = { category: true, unit: true };

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateProductDto, actingUserId: string) {
    const product = await this.prisma.product.create({
      data: dto,
      include: productInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Product',
      entityId: product.id,
      action: 'CREATE',
      after: product,
    });

    return product;
  }

  findAll() {
    return this.prisma.product.findMany({
      include: productInclude,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto, actingUserId: string) {
    const before = await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: productInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Product',
      entityId: product.id,
      action: 'UPDATE',
      before,
      after: product,
    });

    return product;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: productInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Product',
      entityId: product.id,
      action: 'DEACTIVATE',
      before,
      after: product,
    });

    return product;
  }
}
