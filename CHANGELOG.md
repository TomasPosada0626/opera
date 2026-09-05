# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/). El historial detallado
de cambios previos a este archivo vive en `git log` — no se reconstruye acá
hacia atrás; este changelog arranca desde que se creó.

## [Sin publicar]

### Añadido

- Instalador de Windows autocontenido: Electron administra Postgres y el
  backend como procesos propios (`electron/backend-manager.ts`), el
  instalador NSIS embebe y auto-instala Docker Desktop si hace falta (con
  reinicio y retoma automáticos si hay que activar WSL/Virtual Machine
  Platform, consentimiento explícito de licencia en el wizard), y la primera
  cuenta de administrador se crea en una pantalla propia
  (`POST /setup/admin`) en vez de por `.env`/`pnpm db:seed`. Ver
  [ADR 0008](docs/adr/0008-instalador-autocontenido-docker-desktop.md).
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
- Backup automático de Postgres mientras Opera sigue abierto (antes,
  `scripts/backup-db.ts` era manual/bajo demanda, y en el instalador
  empaquetado ni siquiera apuntaba al contenedor correcto). Corre cada 6
  horas mientras la app está abierta, sin repetir antes de 24 horas.

### Corregido

- Condición de carrera real en `POST /setup/admin`: dos requests
  concurrentes (dos dispositivos de la LAN, o un doble clic) podían crear
  dos administradores; ahora corre dentro de una transacción `Serializable`.
- `electron/backend-manager.ts`: dos `start()` concurrentes (el arranque
  inicial y un `backend:retry` disparado mientras el primero seguía en
  curso) podían dejar dos backends reales corriendo a la vez; ahora se
  encadenan (`startChain`).
- El Postgres del instalador empaquetado compartía nombre de
  contenedor/volumen/puerto con el de desarrollo (`docker-compose.yml`),
  arriesgando que abrir la app empaquetada en la misma PC de desarrollo
  reusara la base equivocada sin darse cuenta; namespacing propio
  (`opera-postgres-app`, puerto `5433`).
- `scripts/backup-db.ts` seguía apuntando al nombre de contenedor viejo tras
  el rename anterior — acepta `POSTGRES_CONTAINER` para el Postgres del
  instalador empaquetado (ver "Puesta en marcha" del README).
- `app.enableShutdownHooks()` faltante en el backend: Nest nunca escuchaba
  `SIGTERM`/`SIGINT`, así que `PrismaService.onModuleDestroy()` nunca
  llegaba a cerrar el pool de conexiones al cerrar Opera.
- Mensaje de error de migraciones (`backend-manager.ts`) exponía el
  `stderr` crudo de Prisma en la UI, rompiendo el criterio de lenguaje
  llano del resto del archivo — ahora el detalle va solo al log de errores.
- Rotación de `error-log-store.ts` (10 MB / 2 respaldos) podía lanzar sin
  atrapar dentro del propio handler de `uncaughtException`, arriesgando
  perder el error original que se quería loguear.
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

### Seguridad

- `POST /setup/admin` sin restricción de origen: cualquier dispositivo de
  la LAN podía llamarlo mientras el backend escucha en `0.0.0.0` — ahora
  requiere loopback (`LoopbackOnlyGuard`).
- Vector de escalación de privilegios local en el mecanismo de retoma del
  instalador tras el reinicio de WSL: el binario que ejecuta la tarea
  programada (como SYSTEM) podía quedar en una ruta escribible por
  cualquier cuenta si se instalaba fuera de `Program Files` — permisos
  restrictivos (`icacls`) sobre ese binario, y la corrida de retoma ahora
  exige un consentimiento previo registrado por la corrida interactiva
  antes de instalar Docker Desktop, en vez de confiar solo en el flag de
  línea de comandos.
- CVEs `high`/`moderate` en `fast-uri`/`qs` (dependencias transitivas de
  `@nestjs/cli` y `express`) fijados por override a versiones parcheadas.
- CVE `high` en `@xmldom/xmldom` (dependencia transitiva) fijado por
  override a versión parcheada.
- La contraseña de Postgres del instalador empaquetado ya no se genera por
  cuenta de Windows (`app.getPath('userData')`) — una PC compartida entre
  dos cuentas generaba una contraseña distinta por cuenta, que no coincidía
  con la que el contenedor ya tenía fija desde su `initdb`, y un archivo de
  secretos corrupto dejaba el negocio sin poder acceder a su propio
  inventario/pedidos/clientes. El instalador NSIS ahora la genera una sola
  vez por máquina, antes de que exista cualquier contenedor, y la guarda en
  `ProgramData` con permisos restringidos (`icacls`); `backend-manager.ts`
  pasa a ser lector, y falla con un mensaje distinguible (en vez de generar
  una contraseña nueva a ciegas) si el contenedor ya existe pero el archivo
  se perdió.
- La contraseña de Postgres ya no puede filtrarse al log de errores
  exportable: cualquier connection string se redacta antes de guardarse.

### Rendimiento

- `ProductionOrdersService.complete()`, `OrdersService.markWarehoused()` y
  `RemissionsService.create()`/`voidRemission()`: loops secuenciales de N
  escrituras/consultas por componente/línea reemplazados por operaciones
  agrupadas (`stockMovement.createMany`, `getStockForProducts`/
  `getAverageCostForProducts`, `groupBy`) — menos tiempo con locks abiertos
  dentro de transacciones `Serializable`.

### Pruebas

- Cobertura de `electron/backend-manager.ts` (timeouts/reintentos con
  `vi.useFakeTimers()`, condición de carrera de `retry()`, puerto ocupado),
  `electron/preload.ts`, `electron/error-log-store.ts` y
  `scripts/backup-db.ts` — antes ninguno de los cuatro tenía test propio;
  el último ni siquiera era visible para Jest (`rootDir: "src"`), ahora
  incluido vía `roots`.
- `scripts/parse-checksums.js`: `parseExpectedHash()` extraída de
  `fetch-docker-installer.js` a un módulo sin I/O, específicamente para
  poder testearla sin mockear `node:https`.
- Cache de Docker Desktop en CI (`ci.yml`/`release.yml`) verificado contra
  una corrida real de GitHub Actions, no solo revisando el YAML.
- Suite dedicada para `CatalogService` (la base compartida de los 6 módulos
  de catálogo), antes solo cubierta indirectamente vía cada subclase.
- Cobertura de `electron/main.ts` y `electron/updater.ts` — antes sin
  ningún test propio, ya que Playwright corre con `NODE_ENV=test` (se salta
  el plugin de electron por completo) y nunca los ejercitaba.

## [0.0.1] — 2026-08-27

Estado del proyecto al momento de crear este changelog: 7 milestones
completos (M0–M6), 94/94 issues cerrados en GitHub. Ver `README.md` y
`git log` para el historial completo hasta este punto.
