import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  // Búsqueda global de "salto rápido" (#77) — no reemplaza los filtros
  // propios de cada listado (Productos/Clientes/Proveedores ya tienen su
  // propio `search`, ver #48/#49/#95), es para encontrar UN registro
  // concreto por código/nombre/número sin saber en qué pantalla vive.
  // "Remisión" es la única categoría que no puede usar `contains`: number
  // es un Int (Prisma no hace substring match sobre columnas numéricas),
  // así que solo matchea si el término completo es un entero — coincide
  // con cómo alguien de verdad busca un consecutivo (lo escribe completo,
  // no un prefijo).
  async search(query: SearchQueryDto) {
    const { q, limit = 5 } = query;
    const parsedNumber = Number.isInteger(Number(q)) ? Number(q) : undefined;

    const [products, customers, suppliers, remissions, productionOrders] =
      await Promise.all([
        this.prisma.product.findMany({
          where: {
            isActive: true,
            OR: [
              { sku: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, sku: true, name: true },
          take: limit,
        }),
        this.prisma.customer.findMany({
          where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
          select: { id: true, name: true },
          take: limit,
        }),
        this.prisma.supplier.findMany({
          where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
          select: { id: true, name: true },
          take: limit,
        }),
        parsedNumber === undefined
          ? Promise.resolve([])
          : this.prisma.remission.findMany({
              where: { number: parsedNumber },
              select: { id: true, number: true, orderId: true },
              take: limit,
            }),
        this.prisma.productionOrder.findMany({
          where: {
            product: {
              OR: [
                { sku: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
          select: {
            id: true,
            status: true,
            product: { select: { id: true, sku: true, name: true } },
          },
          take: limit,
        }),
      ]);

    return { products, customers, suppliers, remissions, productionOrders };
  }
}
