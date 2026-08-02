import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryModule } from '../src/inventory/inventory.module';
import { InventoryService } from '../src/inventory/inventory.service';

// Integración real contra Postgres (no mocks): el objetivo es probar que
// Postgres + $transaction Serializable (ver #22, #23, #25) realmente impiden
// un sobregiro cuando varias operaciones concurrentes compiten por el mismo
// stock — algo que un test con Prisma mockeado no puede validar.
describe('Inventory concurrency (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let inventoryService: InventoryService;

  let productId: string;
  let warehouseId: string;
  let userId: string;
  let categoryId: string;
  let unitId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, InventoryModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    inventoryService = moduleFixture.get(InventoryService);

    const unique = Date.now();
    const category = await prisma.category.create({
      data: { name: `ConcurrencyCat-${unique}` },
    });
    const unit = await prisma.unit.create({
      data: { name: `ConcurrencyUnit-${unique}`, abbreviation: `cu${unique}` },
    });
    const product = await prisma.product.create({
      data: {
        sku: `CONC-${unique}`,
        name: 'Producto de prueba de concurrencia',
        type: 'FINISHED_GOOD',
        categoryId: category.id,
        unitId: unit.id,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: { name: `ConcurrencyWarehouse-${unique}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `concurrency-${unique}@opera.local`,
        password: 'not-a-real-hash',
        name: 'Concurrency Test',
      },
    });

    categoryId = category.id;
    unitId = unit.id;
    productId = product.id;
    warehouseId = warehouse.id;
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.unit.delete({ where: { id: unitId } });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('never lets concurrent SALIDA requests oversell stock', async () => {
    await inventoryService.createEntry(
      { productId, warehouseId, quantity: 100 },
      userId,
    );

    // 10 salidas concurrentes de 20 cada una = 200 solicitadas contra 100
    // disponibles. Como mucho 5 pueden ganar sin que el stock quede negativo.
    const attempts = Array.from({ length: 10 }, () =>
      inventoryService.createExit(
        { productId, warehouseId, quantity: 20 },
        userId,
      ),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Si todas hubieran ganado (sin el $transaction Serializable protegiendo),
    // esto sería exactamente el bug que #25 existe para prevenir.
    expect(failed.length).toBeGreaterThan(0);
    expect(succeeded.length).toBeLessThanOrEqual(5);

    const finalStock = await inventoryService.getStock(productId, warehouseId);
    const expectedStock = 100 - succeeded.length * 20;

    expect(finalStock.toString()).toBe(expectedStock.toString());
    expect(finalStock.greaterThanOrEqualTo(0)).toBe(true);
  });
});
