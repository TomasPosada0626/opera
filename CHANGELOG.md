# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/). El historial detallado
de cambios previos a este archivo vive en `git log` — no se reconstruye acá
hacia atrás; este changelog arranca desde que se creó.

## [Sin publicar]

### Añadido

- `PATCH /:id/reactivate` en los 6 módulos de catálogo (customers, suppliers,
  products, categories, units, warehouses) — antes desactivar no tenía vuelta
  atrás.
- Validación de `isActive` antes de operar en `orders.create`,
  `production.create` y `supplier-purchases.create` — un cliente/bodega/
  producto/proveedor desactivado ya no puede recibir pedidos, órdenes de
  producción o compras nuevas.
- `PATCH :id/reactivate`, filtro global de errores de Prisma
  (`PrismaExceptionFilter`), guards de autenticación globales por defecto
  (`@Public()` explícito para las 3 rutas abiertas), y validación de entorno
  con Joi al arranque.
- Índices GIN/trigram (`pg_trgm`) para las búsquedas de texto en Product,
  Customer y Supplier; índice compuesto en `StockMovement` que cubre el
  `ORDER BY createdAt` de `getAverageCost()`/`getKardex()`.
- `ErrorBoundary` de React envolviendo la app de escritorio completa.
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
  estado en el `where`).
- Timing oracle en el login: `AuthService.validateUser` ya no hace
  short-circuit antes de `argon2.verify` cuando el email no existe, así el
  tiempo de respuesta no delata qué emails están registrados.
- `AuditService.log()` ya no puede convertir una operación exitosa en un 500
  si la escritura del log falla — se loguea como warning en vez de propagar.
- `packages/backend/package.json`: `start:prod` apuntaba a `dist/main`
  (no existe); el build real deja el entry point en `dist/src/main.js`.
- `packages/desktop/scripts/generate-self-signed-cert.ps1` y el README ya no
  indican importar el certificado también a `Cert:\LocalMachine\Root`
  (sobre-privilegio real; `TrustedPublisher` alcanza).

### Rendimiento

- `ProductionOrdersService.complete()` y `RemissionsService.create()`:
  loops secuenciales de N consultas por componente/línea reemplazados por
  consultas agrupadas (`getStockForProducts`/`getAverageCostForProducts`,
  `groupBy`) — menos tiempo con locks abiertos dentro de transacciones
  `Serializable`.

## [0.0.1] — 2026-08-27

Estado del proyecto al momento de crear este changelog: 7 milestones
completos (M0–M6), 94/94 issues cerrados en GitHub. Ver `README.md` y
`git log` para el historial completo hasta este punto.
