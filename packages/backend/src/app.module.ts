import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { CategoriesModule } from './categories/categories.module';
import { UnitsModule } from './units/units.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProductionOrdersModule } from './production/production-orders.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SupplierProductsModule } from './supplier-products/supplier-products.module';
import { SupplierPurchasesModule } from './supplier-purchases/supplier-purchases.module';
import { OrdersModule } from './orders/orders.module';
import { RemissionsModule } from './remissions/remissions.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env raíz ya se carga en ./config/env (side effect en main.ts), antes de
      // que Nest resuelva ningún módulo — evita depender del orden de inicialización.
      ignoreEnvFile: true,
    }),
    // Reemplaza el Logger por defecto de Nest en toda la app (main.ts hace
    // `app.useLogger(app.get(Logger))`) — logs estructurados (JSON) con un
    // id de correlación por request, no solo texto suelto en consola.
    // Encontrado como hueco real en la revisión de seguridad de cierre de
    // M6: sin esto, un fallo en la máquina de la usuaria final no dejaba
    // ningún rastro que revisar después.
    LoggerModule.forRoot({
      pinoHttp: {
        // Silencioso en tests (Jest fija NODE_ENV=test) — el ruido de cada
        // request de la suite e2e no aporta nada y solo escribiría al
        // logs/ rotado en cada corrida.
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        // pino-http genera un id por request (`req.id`) automáticamente —
        // ese es el "correlation id": todas las líneas de una misma
        // request comparten el mismo id, así que un error se puede rastrear
        // hasta la petición completa que lo causó, no solo verse suelto.
        transport: {
          targets: [
            {
              target: 'pino-roll',
              options: {
                file: 'logs/opera-backend.log',
                size: '10m',
                limit: { count: 5 },
                mkdir: true,
              },
              level: 'info',
            },
            // Pretty-print a consola solo fuera de producción — en
            // producción el archivo rotado ya es la fuente real, duplicar
            // a consola ahí no aporta nada.
            ...(process.env.NODE_ENV === 'production'
              ? []
              : [
                  {
                    target: 'pino-pretty',
                    options: { colorize: true, singleLine: true },
                    level: 'info',
                  },
                ]),
          ],
        },
        // Nunca loguear el JWT ni una contraseña en texto plano, ni por
        // accidente vía el header Authorization o un body de /auth/login.
        redact: {
          paths: ['req.headers.authorization', 'req.body.password'],
          censor: '[redactado]',
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      },
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
    RolesModule,
    WarehousesModule,
    CategoriesModule,
    UnitsModule,
    ProductsModule,
    InventoryModule,
    ProductionOrdersModule,
    CustomersModule,
    SuppliersModule,
    SupplierProductsModule,
    SupplierPurchasesModule,
    OrdersModule,
    RemissionsModule,
    ReportsModule,
    DashboardModule,
    SearchModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
