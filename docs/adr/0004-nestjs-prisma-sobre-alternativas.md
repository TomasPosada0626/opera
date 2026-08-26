# ADR 0004: NestJS + Prisma sobre otras alternativas de backend

## Estado

Aceptada.

## Contexto

Opera necesitaba un backend de API REST en TypeScript (mismo lenguaje que el
cliente de escritorio, ver [ADR 0003](0003-electron-sobre-spa-servida.md), para no
partir el equipo de uno entre dos lenguajes) que sostuviera: RBAC por rol
(ADMIN/futuro no-ADMIN), transacciones explícitas con nivel de aislamiento
controlable (el Kardex append-only de [ADR 0001](0001-kardex-append-only.md) y el
costeo promedio ponderado de [ADR 0002](0002-costeo-promedio-ponderado.md)
dependen de que una condición de carrera entre dos movimientos de stock
concurrentes sea imposible, no solo improbable), y un ritmo de desarrollo en
solitario donde la estructura del proyecto no se negocia en cada módulo nuevo.
Las alternativas reales consideradas:

- **Framework**: NestJS vs. Express/Fastify "a mano" vs. un framework con más
  opinión aún (AdonisJS).
- **Acceso a datos**: Prisma vs. TypeORM vs. Drizzle vs. SQL crudo con un query
  builder (Knex/Kysely).

## Decisión

**NestJS** como framework, **Prisma** como capa de acceso a datos sobre
PostgreSQL.

**Por qué NestJS y no Express/Fastify sin framework.** Un ERP con más de 20
recursos (productos, inventario, producción, pedidos, remisiones, proveedores,
clientes, usuarios, reportes...) construido en solitario necesita que cada
módulo nuevo tenga la misma forma sin tener que redecidir la estructura cada vez
— controller/service/DTO/módulo es un molde repetible, no una convención que hay
que recordar aplicar a mano. Los guards de RBAC (`@Roles('ADMIN')`, ver
`packages/backend/src/auth/`) y el interceptor de auditoría
(`AuditService.log()`, invocado desde cada mutación) son transversales a todos
los módulos — con Express puro habría sido middleware aplicado módulo por
módulo, con más superficie para que alguno se quede sin protección por
descuido. El costo aceptado es la inyección de dependencias de Nest, más
ceremonia que una función de ruta suelta, pero para el tamaño de este proyecto
la ceremonia paga: cada `*.service.spec.ts` mockea sus dependencias por
constructor sin artificios adicionales. AdonisJS se descartó por tener mucho
menos ecosistema/documentación en español y en general que Nest, relevante
porque este proyecto se apoya en la doc oficial como referencia constante, no
en tribal knowledge de un equipo.

**Por qué Prisma y no TypeORM.** Ambos son ORMs completos para TypeScript, pero
TypeORM resuelve la forma del schema con decoradores sobre clases de entidad —
el schema vive implícito, repartido entre entidades — mientras Prisma lo declara
en un único archivo (`schema.prisma`) del que se generan tanto las migraciones
como el cliente tipado. Para un proyecto de un solo desarrollador donde el
schema cambia con frecuencia (cada milestone agregó modelos nuevos: `Order`
en M3, `Remission`/`SupplierProduct`/`SupplierPurchase` en M5), tener el schema
completo legible de un vistazo — y poder generar el diff de migración
explícitamente (`prisma migrate dev` / `migrate diff`, ver flujo documentado en
el README) en vez de que TypeORM lo infiera de las clases — es una ventaja
directa para revisar qué cambió antes de aplicarlo contra Postgres real.
TypeORM's `QueryRunner` también expone el nivel de aislamiento de una
transacción, pero Prisma's `$transaction(fn, { isolationLevel:
Prisma.TransactionIsolationLevel.Serializable })` (usado en
`InventoryService`, `OrdersService.markWarehoused`, etc.) es la forma más
directa que se encontró de expresar "esta transacción no tolera lecturas
fantasma" sin envolver manualmente el ciclo de vida del `QueryRunner`.

**Por qué Prisma y no Drizzle.** Drizzle es más liviano y más cercano a SQL
(menos "magia"), con mejor rendimiento en benchmarks — una razón real a favor.
Se descartó en el momento de arrancar el proyecto (M1) porque su tooling de
migraciones y su generación de tipos eran comparativamente más nuevos y menos
documentados que los de Prisma en ese momento, y el cliente generado de Prisma
(tipos exactos por modelo, autocompletado de relaciones anidadas) reduce
directamente el tipo de error que este proyecto no puede permitirse: escribir
`unitCost` en el modelo equivocado y descubrirlo en producción, no en
compilación. Drizzle sigue siendo una alternativa válida a revisar si el
proyecto creciera a necesitar control más fino sobre el SQL generado (agregados
complejos en reportes, por ejemplo) — no se reabre esta decisión sin una razón
concreta que Prisma no pueda resolver con `$queryRaw`.

**Por qué no SQL crudo con un query builder (Knex/Kysely).** Da el control más
directo sobre las queries, pero renuncia a la generación automática de tipos a
partir del schema — cada cambio de columna implicaría actualizar tipos a mano
en múltiples lugares, exactamente el tipo de desincronización silenciosa que
Prisma elimina por construcción. Para un ERP donde el schema es el contrato
central de todo el sistema (Kardex, costeo, RBAC), ese costo no se justificaba
frente al beneficio de rendimiento/control que un query builder ofrece.

## Consecuencias

**A favor:**

- Un molde repetible (controller/service/DTO/módulo) que escaló a más de 20
  recursos sin que la estructura se volviera un problema de por sí.
- RBAC y auditoría como transversales reales (`@Roles`, `AuditService.log()`),
  no convenciones que dependan de que cada módulo se acuerde de aplicarlas.
- `schema.prisma` como fuente única de verdad del modelo de datos, con
  migraciones generadas y revisables antes de aplicarse (ver flujo en el
  README), y un cliente tipado que hace que un error de nombre de columna sea
  un error de compilación, no un bug en producción.
- `$transaction(..., { isolationLevel: Serializable })` como primitiva directa
  para las invariantes de Kardex/costeo que no toleran condiciones de carrera.

**En contra / costos aceptados:**

- Inyección de dependencias y decoradores de Nest son más ceremonia que rutas
  sueltas de Express — aceptado porque el tamaño del proyecto ya lo justifica,
  no lo habría justificado para un servicio de un solo endpoint.
- Prisma no da el control de SQL generado que da Drizzle o un query builder —
  los reportes con agregados más complejos (`ReportsService`) ya usan
  `$queryRaw` puntualmente donde el generador de Prisma no alcanza, aceptando
  esa fuga de abstracción como excepción documentada, no como la regla.
- `prisma generate` es un paso de build adicional que no existe con un query
  builder plano — mitigado con el script `postinstall` (`packages/backend/package.json`),
  así que no depende de que cada desarrollador lo recuerde a mano.
- Migrar de versión mayor de Prisma (ver #100, Prisma 6→7) es un evento propio
  que requiere revisar breaking changes explícitamente — un costo que un query
  builder más delgado no tendría en la misma magnitud.
