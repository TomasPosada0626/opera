import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { CategoriesModule } from './categories/categories.module';
import { UnitsModule } from './units/units.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProductionOrdersModule } from './production/production-orders.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env raíz ya se carga en ./config/env (side effect en main.ts), antes de
      // que Nest resuelva ningún módulo — evita depender del orden de inicialización.
      ignoreEnvFile: true,
    }),
    // Límite global por defecto para toda la API; /auth/login pisa esto con
    // un límite propio más estricto vía @Throttle (ver AuthController).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    WarehousesModule,
    CategoriesModule,
    UnitsModule,
    ProductsModule,
    InventoryModule,
    ProductionOrdersModule,
    CustomersModule,
    SuppliersModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
