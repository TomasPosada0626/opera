import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SearchService', () => {
  let prisma: {
    product: { findMany: jest.Mock };
    customer: { findMany: jest.Mock };
    supplier: { findMany: jest.Mock };
    remission: { findMany: jest.Mock };
    productionOrder: { findMany: jest.Mock };
  };
  let service: SearchService;

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
      supplier: { findMany: jest.fn().mockResolvedValue([]) },
      remission: { findMany: jest.fn().mockResolvedValue([]) },
      productionOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new SearchService(prisma as unknown as PrismaService);
  });

  it('matches products by sku or name, only active ones', async () => {
    await service.search({ q: 'silla', limit: 5 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: [
            { sku: { contains: 'silla', mode: 'insensitive' } },
            { name: { contains: 'silla', mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
    );
  });

  it('matches customers and suppliers by name, only active ones', async () => {
    await service.search({ q: 'valle', limit: 5 });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          name: { contains: 'valle', mode: 'insensitive' },
        },
      }),
    );
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          name: { contains: 'valle', mode: 'insensitive' },
        },
      }),
    );
  });

  it('only searches remissions when the term is a whole integer', async () => {
    await service.search({ q: '42', limit: 5 });

    expect(prisma.remission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { number: 42 } }),
    );
  });

  it('skips the remission lookup entirely for a non-numeric term', async () => {
    const result = await service.search({ q: 'silla', limit: 5 });

    expect(prisma.remission.findMany).not.toHaveBeenCalled();
    expect(result.remissions).toEqual([]);
  });

  it('matches production orders by their product sku or name', async () => {
    await service.search({ q: 'pino', limit: 5 });

    expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          product: {
            OR: [
              { sku: { contains: 'pino', mode: 'insensitive' } },
              { name: { contains: 'pino', mode: 'insensitive' } },
            ],
          },
        },
      }),
    );
  });

  it('caps every category at the given limit', async () => {
    await service.search({ q: 'x', limit: 3 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });
});
