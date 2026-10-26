# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/). El historial detallado
de cambios previos a este archivo vive en `git log` — no se reconstruye acá
hacia atrás; este changelog arranca desde que se creó.

## [Sin publicar]

### Añadido

- Remisión impresa con el formato en papel de Herrajes Toro
  ([ADR 0011](docs/adr/0011-iva-por-pedido-y-remision-con-el-formato-en-papel.md)):
  dos copias en una hoja carta vertical (cliente arriba, empresa abajo, con
  línea de corte), datos del cliente, tabla con material, acabado, unidad de
  empaque, cantidad, precio y total, y subtotal, IVA, total, nota de
  reclamos, firma, zona y asesor. El PDF de la remisión usa el mismo
  formato.
- Consecutivo de remisiones `HT`: arranca en la HT 3286, continuando el
  talonario en papel. La búsqueda acepta "HT 3286" o solo el número.
- IVA por pedido (sin IVA o 19 %), editable mientras el pedido no tenga
  remisiones. Cada remisión guarda subtotal, IVA y total, y la cartera usa el
  total con IVA.
- Ficha del cliente con ciudad, país, celular, zona, asesor y condiciones de
  pago, que salen solos en la remisión impresa.
- Compras con varias líneas (`/purchase-orders`, pantalla Compras):
  consecutivo, fecha esperada, número de factura del proveedor, anticipo
  opcional. Recepción parcial: cada llegada de mercancía es una ENTRADA del
  Kardex con el costo de la compra. Cerrar con lo recibido cuando el
  proveedor no manda el resto, y cancelar si no llegó nada. Ver
  [ADR 0010](docs/adr/0010-compras-con-varias-lineas-y-cuentas-por-pagar.md).
- Cuentas por pagar: pagos al proveedor con medio, fecha y referencia
  (anulables con motivo), saldo por proveedor en su ficha
  (`GET /suppliers/:id/balance`), reporte "Por pagar" con antigüedad
  (`GET /reports/por-pagar`, + Excel) y el total por pagar en el dashboard.
- Seguimiento de pedidos: consecutivo legible (`Pedido No. 45`), fecha de
  envío estimada y notas editables (`PATCH /orders/:id`), estado
  `DESPACHADO` automático cuando lo remisionado cubre todo lo pedido, y
  `dispatchedAt`/`cancelledAt` para medir el tiempo en cada estación.
  Filtro `?overdue=true` de pedidos atrasados y búsqueda por número.
- Cobro por abonos (`RemissionPayment`): cada pago con monto, medio, fecha
  y referencia, anulable con motivo (`POST /remissions/:id/payments`,
  `PATCH /remissions/:id/payments/:id/void`). El estado de pago se calcula
  solo. Historial de abonos por cliente (`GET /customers/:id/payments`) y
  reporte de cartera con antigüedad (`GET /reports/cartera`, + Excel). Ver
  [ADR 0009](docs/adr/0009-lista-de-materiales-opcional-y-cobro-por-abonos.md).
- Lista de materiales editable (`GET/PUT/DELETE
/products/:id/bill-of-materials`, pantalla en Productos → Materiales).
  Si un producto la tiene, al pasar su pedido a almacén se descuentan sus
  materias primas y el terminado entra con su costo.
- Pantalla de Auditoría (`GET /audit` ya existía, no tenía pantalla).
- Código de recuperación de contraseña sin correo: se muestra una vez al
  crear la cuenta (`POST /setup/admin`), se regenera desde el menú de
  usuario y se usa en "¿Olvidaste tu contraseña?"
  (`POST /auth/reset-password-with-recovery-code`), que lo consume y
  muestra el siguiente. `GET /auth/recovery-options`: la pantalla solo
  ofrece el correo si SMTP está configurado. Aviso en la app para cuentas
  que todavía no tienen código.
- Restaurar un respaldo desde la app (menú de usuario → Respaldos):
  respalda el estado actual primero, aplica el respaldo en una sola
  transacción y pide iniciar sesión de nuevo. Antes había que hacerlo desde
  una terminal con `gunzip`, que Windows no trae.
- Pantallas de inicio de sesión, configuración inicial y recuperación con
  un marco común (panel de marca + formulario).
- Si Docker Desktop no está corriendo, Opera lo abre sola y lo espera
  (hasta 3 minutos) en vez de mostrar un error. Mensajes distintos para
  Docker no instalado, cuenta sin permiso de `docker-users` (pide cerrar
  sesión), Docker que no arranca (virtualización) y la primera descarga de
  la base sin internet.
- Pantalla de arranque con los pasos reales (Docker, base de datos,
  preparación, apertura), barra de progreso y, si falla, botones para
  reintentar y exportar el registro de errores.
- Una sola ventana de Opera a la vez: abrirla de nuevo trae al frente la
  que ya estaba abierta, en vez de levantar un segundo backend.
- Instalador: aviso previo si la virtualización está apagada en el BIOS,
  permiso de `docker-users` para la cuenta que va a usar Opera (también
  tras el reinicio de WSL, que corre como SYSTEM), pedido de reinicio al
  terminar de instalar Docker Desktop, y asistente solo en español.
- Guía "Instalar Opera en otra PC" en el README.
- Se entra con un nombre de usuario (`herrajestoro`) o con un correo, sin
  distinguir mayúsculas: en el login, la configuración inicial, Usuarios y
  la recuperación con código. Antes todo exigía un correo, que en la app de
  escritorio (sin SMTP) no se usa para nada. Una migración pasa a
  minúsculas los identificadores existentes.
- README: lo que Opera no hace a propósito (factura electrónica DIAN, roles
  distintos al administrador).
- Rediseño completo de la app de escritorio: Dashboard alrededor de lo que
  necesita atención, detalle de pedido con línea de tiempo de estaciones y
  panel de cobro, Reportes por pestañas, tipografía Geist, sistema de
  componentes refinado (PageHeader, Tabs, FilterChips, KPICard enlazable,
  Modal con tamaños) y sidebar por secciones.
- `.github/workflows/audit.yml`: `pnpm audit` semanal sobre `main`.

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
- Indicador de backup automático en el menú de usuario ("Último respaldo
  exitoso: hace N días" / aviso si las últimas corridas fallaron),
  calculado del lado del cliente a partir del marcador local — sin salir a
  internet, coherente con el diseño LAN-only. Antes el backup automático
  era invisible para quien usa la app.
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
- Reintento con backoff exponencial en la descarga del instalador de Docker
  Desktop embebido (600+ MB) — antes, un solo corte de red a mitad de
  camino tumbaba el build entero.

### Corregido

- Remisión impresa: debajo de los productos van solo 2 renglones en blanco, no
  el resto de la plantilla. Rellenar hacía que un solo nombre largo desbordara
  la media hoja y cada copia saliera en su propia hoja (con decenas de filas
  vacías), gastando el doble de papel. Ahora las dos copias salen en una hoja
  carta; solo si un pedido no cabe ni sin los renglones en blanco, cada copia
  va en su hoja, sin relleno (versión 1.0.3).
- Instalador y primer arranque, a partir de las dos primeras PCs reales
  (versión 1.0.1, adenda en
  [ADR 0008](docs/adr/0008-instalador-autocontenido-docker-desktop.md)):
  - el backend empaquetado ya trae el cliente de Prisma generado (antes se
    caía al arrancar);
  - el instalador activa WSL con el `dism`/`wsl` de 64 bits e instala el
    paquete de WSL;
  - la reanudación tras el reinicio ya no pierde el consentimiento de
    Docker (las marcas viven en `%ProgramData%\Opera\setup`);
  - las migraciones ya no fallan con EPERM en `C:\Program Files`;
  - Opera encuentra Docker Desktop fuera de Program Files y espera si su
    instalación sigue en curso;
  - el backend tiene 2 minutos para responder en el primer arranque;
  - una instalación nueva abre "crear la primera cuenta" en vez del login;
  - los datos van a `%APPDATA%\Opera` (se copian solos desde
    `%APPDATA%\desktop`);
  - el primer respaldo automático corre a los 5 minutos de abrir Opera.
- Una sola fábrica: con una sola bodega, la app ya no muestra la columna
  "Bodega" (Kardex, Producción), el filtro por bodega del Kardex, la bodega
  en el detalle de pedidos/compras y en la remisión impresa, ni el menú
  Bodegas. El selector de bodega ignora las desactivadas al decidir si hay
  una sola (antes las contaba y hasta las ofrecía).
- Cantidades decimales mostradas tal como llegaban de la base: "10.000"
  por diez unidades (en Colombia se lee diez mil) o "1171.2 kg"; costos sin
  formato de pesos en Kardex, Producción y compras a proveedores. Ahora todo
  pasa por los formateadores comunes en es-CO.
- Los montos y conteos se veían en letra monoespaciada; ahora usan Geist
  con dígitos tabulares (siguen alineados en columna). La mono queda para
  SKU, códigos e identificadores.
- El instalador mostraba "Docker Desktop no pudo iniciar… revisa el BIOS"
  después de cada instalación nueva de Docker, que todavía no está corriendo
  en ese momento. El aviso ahora sale antes de instalar y solo si de verdad
  la virtualización está apagada.
- Reinstalar Opera con Docker Desktop cerrado ofrecía reinstalar Docker
  completo.
- La app empaquetada mostraba el menú por defecto de Electron (en inglés),
  arrancaba en una ventana de 1024x640 y con un destello blanco.
- Listados de clientes y proveedores: NIT, teléfono y "Ver detalle" se
  partían en varias líneas; el nombre ahora lleva al detalle.
- Los respaldos automáticos de la app empaquetada fallaban siempre: la
  carpeta `%ProgramData%\Opera\backups` quedaba con permisos solo para
  SYSTEM/Administradores y la app corre como usuario normal. Ahora van a
  `%APPDATA%\Opera\backups`.
- El log del backend empaquetado intentaba escribirse dentro de Program
  Files (sin permiso para un usuario normal); ahora va a
  `%APPDATA%\Opera\logs` (`LOG_DIR`).
- Pedir "olvidé mi contraseña" con el correo de alguien le cerraba la
  sesión (guardar el código movía `User.updatedAt`); el estado de
  recuperación vive ahora en su propia tabla.
- El saldo pendiente del cliente sumaba también las remisiones anuladas.
- El conteo de órdenes de producción del dashboard (y la búsqueda global)
  usaba un estado `EN_PROCESO` que no existe — siempre 0 — y no mostraba
  las canceladas.
- 79 vulnerabilidades de dependencias acumuladas en `main` desde el
  2026-09-16 (4 críticas, 25 altas), que además bloqueaban en CI todos los
  PRs de Dependabot. `pnpm audit` vuelve a 0.
- 313 warnings de ESLint (casi todos en tests e2e) bajados a 0.

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
- `codeql-action/init` y `codeql-action/analyze` deben moverse en lockstep
  (un mismatch de versión rompe el job con "Loaded a configuration file for
  version X, but running version Y") — Dependabot los había partido en dos
  PRs separadas que en aislamiento rompían CI cada una; sincronizados en un
  solo commit.
- `stopBackendProcess()` dejaba un backend huérfano dueño del puerto si no
  respondía al `SIGTERM` en 5 segundos — ahora escala a `SIGKILL`. La
  escalada en sí no dejaba ningún rastro en el log pase lo que pase — ahora
  se registra en el log de errores exportable, con un mensaje explícito de
  posible deadlock.
- `pg_dump` en `scripts/backup-db.ts` bufferea completo en memoria
  (`execFileSync` con `maxBuffer` de 1 GB, más una segunda copia por
  `zlib.gzipSync`) — documentado como límite consciente de escala, no
  cambiado de arquitectura: por encima de ese techo el backup empieza a
  fallar en silencio salvo por el log de diagnóstico.

### Seguridad

- El backend de la app de escritorio escuchaba en todas las interfaces de
  la LAN; ahora solo en `127.0.0.1` (`HOST`).
- El código de 6 dígitos por correo se invalida tras 5 intentos fallidos.
- Exportar todos los datos de un cliente o proveedor exige rol ADMIN
  explícito.
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
  Ampliado más adelante: además del regex de connection strings, se pasan
  los valores reales conocidos en runtime (contraseña, `JWT_SECRET`, alias
  `postgres://`) a una redacción por reemplazo literal exacto — el regex
  original no cubría ninguno de esos casos.
- `restrictToSystemAndAdmins`/`restrictBackupDirToSystemAndAdmins` tragaban
  cualquier falla de `icacls` sin loguear nada — ahora un fallo real de
  permisos (contraseña o backups con ACL débil) queda registrado en el log
  de errores exportable en vez de invisible.
- La carpeta de backups automáticos (`%ProgramData%\Opera\backups`) ya no
  quedaba con la ACL heredada por defecto de `ProgramData` — restringida a
  SYSTEM/Administradores, igual que la contraseña de Postgres.
- El instalador ya no podía escribir un secreto de Postgres vacío o roto si
  PowerShell fallaba al generarlo — ahora, sin éxito confirmado, no escribe
  nada y deja que la app se autoprovisione en su primer arranque.
- La contraseña de Postgres ya no viaja en la línea de comandos de
  `docker run` (visible para cualquier cuenta de Windows en esa PC vía el
  Administrador de Tareas) — pasa por variable de entorno, mismo criterio
  que `DATABASE_URL`/`JWT_SECRET`.
- 8 vulnerabilidades `high` de `pnpm audit` resueltas: `nodemailer` (DoS por
  complejidad cuadrática en `addressparser`, bump a `^9.1.1`) y `multer`
  (3 CVEs de DoS, dependencia transitiva de `@nestjs/platform-express`,
  fijado por override a `^2.3.0`, mismo patrón que los demás overrides ya
  existentes).
- `@nestjs/*` aislado del group principal de Dependabot hasta que
  `@nestjs/throttler` declare soporte para Nest v12 en sus
  `peerDependencies` (bloqueo real del ecosistema, no un bug propio).

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
- Piso de cobertura por archivo para `packages/desktop/electron/**`
  (`scripts/check-electron-coverage.js`, wireado en `test:cov`) — el umbral
  agregado del paquete completo podía esconder un archivo crítico con
  cobertura hueca detrás del promedio (encontrado real:
  `backend-manager.ts` en 72% de rama, paquete en 87% agregado).
- Smoke test de sintaxis de `installer.nsh` en CI
  (`scripts/check-installer-nsh.js`, corre en `ubuntu-latest` vía el
  `makensis` real que ya cachea `electron-builder`) — atrapa errores de
  sintaxis reales (typos de comando, bloques `${If}/${EndIf}`
  desbalanceados) en ~2s, sin esperar al build completo de Windows. Sigue
  sin poder atrapar una condición lógica invertida que compile limpio (solo
  una corrida real del instalador cierra ese hueco).

## [0.0.1] — 2026-08-27

Estado del proyecto al momento de crear este changelog: 7 milestones
completos (M0–M6), 94/94 issues cerrados en GitHub. Ver `README.md` y
`git log` para el historial completo hasta este punto.
