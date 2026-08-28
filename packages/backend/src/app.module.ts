import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RbacGuard } from './auth/guards/rbac.guard';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
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
      // Antes solo JWT_SECRET fallaba rápido y claro (getOrThrow en
      // auth.module.ts) — el resto de variables fallaba tarde y de forma
      // menos clara si estaban mal formadas (señalado en la auditoría).
      // Esto hace que CUALQUIER variable mal formada tumbe el arranque con
      // un mensaje directo, no un error a medio camino de la primera
      // request que la necesite.
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string()
          .uri({ scheme: ['postgresql', 'postgres'] })
          .required(),
        JWT_SECRET: Joi.string().min(16).required(),
        JWT_EXPIRES_IN: Joi.string().required(),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().port().default(3000),
        SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('false'),
        RATE_LIMIT_PER_MINUTE: Joi.number().positive().optional(),
      }),
      validationOptions: {
        // Cualquier otra variable de entorno del sistema (PATH, HOME, etc.)
        // convive en process.env sin que este schema tenga que enumerarlas
        // todas — solo valida las que Opera realmente lee.
        allowUnknown: true,
        abortEarly: false,
      },
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
    // Configurable solo para poder correr load-tests/ contra un techo más
    // alto que el real de producción (ver load-tests/README.md) — el
    // default sin la variable de entorno sigue siendo 100, igual que antes.
    // forRootAsync + ConfigService (no process.env directo, señalado en la
    // re-auditoría) para leer del mismo config ya validado por Joi arriba.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: configService.get<number>('RATE_LIMIT_PER_MINUTE') ?? 100,
          },
        ],
      }),
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
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Globales a propósito (#auditoría): antes cada controller tenía que
    // acordarse de `@UseGuards(JwtAuthGuard, RbacGuard)` — un controller
    // nuevo sin ese decorador quedaba público por defecto, sin que nada lo
    // atrapara. Ahora es al revés: todo está protegido salvo que una ruta
    // se marque explícitamente con @Public() (ver auth/decorators/public
    // .decorator.ts). El orden importa: Throttler primero (limita incluso
    // requests no autenticadas), después JwtAuth (identifica al usuario),
    // después Rbac (ya puede leer request.user).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    // Sin esto, cualquier violación de una de las 10+ constraints @unique
    // del schema (email, SKU, nombre de categoría/unidad, taxId...) caía
    // como 500 sin manejar en cualquier módulo — nadie lo escribía a mano
    // por servicio. Traduce los códigos de error conocidos de Prisma a
    // respuestas HTTP consistentes en toda la API (ver el filtro mismo).
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
