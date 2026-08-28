# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/). El historial detallado
de cambios previos a este archivo vive en `git log` — no se reconstruye acá
hacia atrás; este changelog arranca desde que se creó.

## [Sin publicar]

### Añadido

- Recuperación de contraseña por correo (`POST /auth/forgot-password` +
  `POST /auth/reset-password`): código de verificación de 6 dígitos,
  hasheado con argon2 (nunca en claro), vence a los 15 minutos, un solo
  uso. Respuesta siempre genérica exista o no el email (nunca revela qué
  correos están registrados). `MailService` (nodemailer, SMTP genérico) es
  best-effort a propósito, mismo criterio que `electron-updater`: sin
  `SMTP_*` configurado, la app sigue funcionando igual, solo se pierde esa
  función puntual. Flujo de dos pasos en la app de escritorio
  (`/olvide-contrasena`, enlazado desde el login).
- `PATCH /:id/reactivate` en los 6 módulos de catálogo (customers, suppliers,
  products, categories, units, warehouses) — antes desactivar no tenía vuelta
  atrás.
- Validación de `isActive` antes de operar en `orders.create`,
  `production.create`, `supplier-purchases.create` y ahora también
  `supplier-products.create` — un cliente/bodega/producto/proveedor
  desactivado ya no puede recibir pedidos, órdenes de producción, compras o
  precios de referencia nuevos.
- `CategoriesService`/`UnitsService`/`WarehousesService` bloquean (400)
  desactivar una entidad todavía en uso real: productos activos para
  Category/Unit, stock real (`stockMovement.groupBy` + `having`) para
  Warehouse.
- `DELETE /supplier-products/:id` (ADMIN) — antes no había ninguna vía para
  quitar el precio de referencia de un proveedor que dejó de vender un
  producto. Botón "Eliminar" por fila en `SupplierDetailPage`.
- `PATCH :id/reactivate`, filtro global de errores de Prisma
  (`PrismaExceptionFilter`), guards de autenticación globales por defecto
  (`@Public()` explícito para las 3 rutas abiertas), y validación de entorno
  con Joi al arranque.
- Índices GIN/trigram (`pg_trgm`) para las búsquedas de texto en Product,
  Customer y Supplier; índice compuesto en `StockMovement` que cubre el
  `ORDER BY createdAt` de `getAverageCost()`/`getKardex()`; índices en
  `AuditLog` que cubren el `ORDER BY timestamp desc` de `query()`/
  `getRecent()` además del filtro.
- `ErrorBoundary` de React envolviendo la app de escritorio completa, más
  una variante `inline` alrededor de `<Outlet/>` en `AppLayout` — un error de
  render en una sola página ya no tumba el sidebar/topbar completos.
- Content-Security-Policy real en el proceso principal de Electron, más
  `contextIsolation`/`sandbox`/`nodeIntegration` explícitos,
  `setWindowOpenHandler` denegando ventanas nuevas y un guard en
  `will-navigate` que bloquea navegar fuera del propio origen de la app.
  Validación runtime de los payloads que cruzan IPC (`auth-token:set`,
  `error-log:report`).
- Los 4 specs de Playwright (`packages/desktop/e2e/`) ahora corren en CI, no
  solo en local.
- Workflow de CodeQL (análisis estático semanal + en cada push/PR a `main`).
- [ADR 0005](docs/adr/0005-no-clean-architecture.md) documentando la decisión
  de no migrar a Clean Architecture/DDD táctico.

### Corregido

- Condición de carrera real en `OrdersService.markWarehoused` y
  `ProductionOrdersService.complete`: un `update` incondicional dentro de una
  transacción `Serializable` dejaba pasar más de una llamada cuando las
  transacciones no llegaban a solaparse de verdad en Postgres (contención de
  pool bajo CI) — reemplazado por un guard atómico (`updateMany` con el
  estado en el `where`), con el mismo patrón ya extendido a
  `RemissionsService.voidRemission()`.
- Timing oracle en el login: `AuthService.validateUser` ya no hace
  short-circuit antes de `argon2.verify` cuando el email no existe, así el
  tiempo de respuesta no delata qué emails están registrados.
- `AuditService.log()` ya no puede convertir una operación exitosa en un 500
  si la escritura del log falla — se loguea como warning en vez de propagar.
- `packages/backend/package.json`: `start:prod` apuntaba a `dist/main`
  (no existe); el build real deja el entry point en `dist/src/main.js`.
- `packages/backend/src/config/env.ts` resolvía el `.env` raíz con una ruta
  relativa a `process.cwd()`, fràgil si el proceso no arrancaba exactamente
  desde `packages/backend`; ahora sube desde `__dirname` hasta encontrar
  `pnpm-workspace.yaml` (la raíz real del monorepo), funciona igual en dev y
  en el build compilado sin importar el cwd del proceso.
- `PORT`/`SWAGGER_ENABLED`/`RATE_LIMIT_PER_MINUTE` se leían de
  `process.env` directo en `main.ts`/`app.module.ts`, esquivando el
  `ConfigService` y los `.default()` que el schema de Joi ya declara — ahora
  pasan por `ConfigService` de forma consistente.
- `packages/desktop/scripts/generate-self-signed-cert.ps1` y el README ya no
  indican importar el certificado también a `Cert:\LocalMachine\Root`
  (sobre-privilegio real; `TrustedPublisher` alcanza).

### Rendimiento

- `ProductionOrdersService.complete()`, `OrdersService.markWarehoused()` y
  `RemissionsService.create()`/`voidRemission()`: loops secuenciales de N
  escrituras/consultas por componente/línea reemplazados por operaciones
  agrupadas (`stockMovement.createMany`, `getStockForProducts`/
  `getAverageCostForProducts`, `groupBy`) — menos tiempo con locks abiertos
  dentro de transacciones `Serializable`.

### Pruebas

- Suite dedicada para `CatalogService` (la base compartida de los 6 módulos
  de catálogo), antes solo cubierta indirectamente vía cada subclase.
- Cobertura de `electron/main.ts` y `electron/updater.ts` — antes sin
  ningún test propio, ya que Playwright corre con `NODE_ENV=test` (se salta
  el plugin de electron por completo) y nunca los ejercitaba.

## [0.0.1] — 2026-08-27

Estado del proyecto al momento de crear este changelog: 7 milestones
completos (M0–M6), 94/94 issues cerrados en GitHub. Ver `README.md` y
`git log` para el historial completo hasta este punto.
