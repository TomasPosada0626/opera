import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/test-app';
import {
  createUserAndLogin,
  createCatalogFixtures,
  deleteUsers,
} from './support/fixtures';

describe('Inventory (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let staffToken: string;
  let staffUserId: string;
  let categoryId: string;
  let unitId: string;
  let warehouseId: string;
  const productIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const admin = await createUserAndLogin(app, prisma, {
      emailPrefix: 'inventory-admin',
      roleName: 'ADMIN',
    });
    adminUserId = admin.id;
    adminToken = admin.token;

    const staff = await createUserAndLogin(app, prisma, {
      emailPrefix: 'inventory-staff',
    });
    staffUserId = staff.id;
    staffToken = staff.token;

    const unique = Date.now();
    const fixtures = await createCatalogFixtures(prisma, `${unique}`);
    categoryId = fixtures.category.id;
    unitId = fixtures.unit.id;
    warehouseId = fixtures.warehouse.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.unit.delete({ where: { id: unitId } });
    await deleteUsers(prisma, [adminUserId, staffUserId]);
    await app.close();
  });

  // La creación de productos es ADMIN-only (ver products.e2e-spec.ts) — este
  // spec se enfoca en el módulo de inventario, así que fabrica el producto
  // directo por Prisma en vez de acoplarse a permisos de otro módulo.
  async function createProduct(overrides: {
    sku: string;
    name: string;
    minStock?: number;
  }) {
    const product = await prisma.product.create({
      data: {
        sku: overrides.sku,
        name: overrides.name,
        type: 'FINISHED_GOOD',
        categoryId,
        unitId,
        minStock: overrides.minStock,
      },
    });
    productIds.push(product.id);
    return product.id;
  }

  // Regresión del /security-review de M2: entradas/salidas/ajustes no tenían
  // ninguna restricción de rol — cualquier JWT válido podía fabricar o drenar
  // stock real. Ahora son ADMIN-only, igual que el resto de mutaciones.
  it('rejects a movement from an authenticated user without the ADMIN role', async () => {
    const productId = await createProduct({
      sku: `INV-RBAC-${Date.now()}`,
      name: 'Producto RBAC',
    });

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ productId, warehouseId, quantity: 10 })
      .expect(403);
  });

  it('still allows a non-ADMIN user to read stock, kardex and low-stock alerts', async () => {
    const productId = await createProduct({
      sku: `INV-READ-${Date.now()}`,
      name: 'Producto lectura',
    });

    await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/inventory/${productId}/kardex`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/inventory/alertas/bajo-stock')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
  });

  it('rejects an entrada with an invalid payload (negative quantity)', async () => {
    const productId = await createProduct({
      sku: `INV-BAD-${Date.now()}`,
      name: 'Producto validación',
    });

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: -5 })
      .expect(400);
  });

  it('runs entrada -> salida -> ajuste and reflects the correct stock and kardex', async () => {
    const productId = await createProduct({
      sku: `INV-FLOW-${Date.now()}`,
      name: 'Producto flujo completo',
    });

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 20 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/inventory/salidas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 5 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/inventory/ajustes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: -2, reason: 'Merma' })
      .expect(201);

    const stockResponse = await request(app.getHttpServer())
      .get(`/inventory/${productId}/stock`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect((stockResponse.body as { stock: string }).stock).toBe('13');

    const kardexResponse = await request(app.getHttpServer())
      .get(`/inventory/${productId}/kardex`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const kardexBody = kardexResponse.body as {
      data: { type: string; user?: { email?: string } }[];
      meta: { total: number };
    };
    expect(kardexBody.meta.total).toBe(3);
    expect(kardexBody.data.map((movement) => movement.type)).toEqual([
      'AJUSTE',
      'SALIDA',
      'ENTRADA',
    ]);
    // Regresión del /security-review de M2: el Kardex no debe filtrar el
    // email de quien registró el movimiento a cualquier usuario autenticado.
    expect(kardexBody.data.every((movement) => !movement.user?.email)).toBe(
      true,
    );
  });

  it('rejects a salida that would push stock below zero', async () => {
    const productId = await createProduct({
      sku: `INV-OVERSELL-${Date.now()}`,
      name: 'Producto sobregiro',
    });

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 5 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/inventory/salidas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 10 })
      .expect(400);
  });

  it('returns 404 when moving stock for a product that does not exist', async () => {
    // Debe ser un UUID v4 con formato válido (el bit de versión importa) —
    // uno con todo ceros falla la validación @IsUUID('4') del DTO (400) antes
    // de llegar al NotFoundException (404) que este test quiere probar.
    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: '11111111-1111-4111-8111-111111111111',
        warehouseId,
        quantity: 1,
      })
      .expect(404);
  });

  it('returns bulk stock for multiple products, defaulting products with no movements to zero (#42)', async () => {
    const productWithStockId = await createProduct({
      sku: `INV-BULK-A-${Date.now()}`,
      name: 'Producto con stock',
    });
    const productWithoutStockId = await createProduct({
      sku: `INV-BULK-B-${Date.now()}`,
      name: 'Producto sin movimientos',
    });

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: productWithStockId, warehouseId, quantity: 8 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/inventory/stock')
      .query({
        productIds: `${productWithStockId},${productWithoutStockId}`,
      })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    const body = response.body as { productId: string; stock: string }[];
    expect(body).toEqual([
      { productId: productWithStockId, stock: '8' },
      { productId: productWithoutStockId, stock: '0' },
    ]);
  });

  it('rejects a bulk stock request with a malformed productId (400)', async () => {
    await request(app.getHttpServer())
      .get('/inventory/stock')
      .query({ productIds: 'not-a-uuid' })
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(400);
  });

  it('reports a product in the low-stock alert once it falls below minStock, and excludes it once restocked', async () => {
    const productId = await createProduct({
      sku: `INV-LOWSTOCK-${Date.now()}`,
      name: 'Producto bajo stock',
      minStock: 10,
    });

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 3 })
      .expect(201);

    const belowThreshold = await request(app.getHttpServer())
      .get('/inventory/alertas/bajo-stock')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const belowIds = (belowThreshold.body as { id: string }[]).map(
      (product) => product.id,
    );
    expect(belowIds).toContain(productId);

    await request(app.getHttpServer())
      .post('/inventory/entradas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, warehouseId, quantity: 20 })
      .expect(201);

    const afterRestock = await request(app.getHttpServer())
      .get('/inventory/alertas/bajo-stock')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const restockedIds = (afterRestock.body as { id: string }[]).map(
      (product) => product.id,
    );
    expect(restockedIds).not.toContain(productId);
  });
});
