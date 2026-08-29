# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop

## Users

Usuario principal hoy: un **Administrador** que opera todos los módulos desde una sola cuenta — `Role` es dinámico en el schema, pero solo existe el rol ADMIN sembrado; ningún otro rol existe todavía. Trabaja dentro de una PyME manufacturera que hoy lleva su inventario y producción en hojas de cálculo, sin trazabilidad confiable de por qué cambió el stock, quién hizo qué, o cuánto costó realmente producir algo. El Administrador usa Opera día a día para registrar movimientos de inventario, correr órdenes de producción y, a partir de M5, gestionar ventas, compras, clientes y proveedores — todo desde una sola máquina de escritorio conectada por LAN.

Roles adicionales que no sean admin (p. ej. Ventas, Compras, Almacén) son un futuro plausible, pero todavía no están decididos ni agendados — no diseñar vistas con permisos para roles que aún no existen; el guard/schema de RBAC ya soporta agregarlos después sin retrabajo.

## Product Purpose

Opera es un ERP de escritorio para inventario, producción, compras y ventas, pensado para PyMEs manufactureras que hoy manejan estos procesos en hojas de cálculo. Existe para que el stock y el costo sean confiables por construcción: cada movimiento de inventario es permanente y queda atribuido a un usuario, el stock actual siempre se deriva del historial de movimientos (nunca se edita a mano), y el costo de producción se calcula a partir de recetas reales y costeo por promedio ponderado en vez de estimarse.

Éxito = que un Administrador pueda operar por completo inventario, producción, compras y ventas de un negocio manufacturero real desde esta app, y pueda confiar en cada número porque el sistema hace que la acción incorrecta (editar stock directamente, borrar un movimiento, cerrar una orden sin validar stock) sea estructuralmente imposible, no solo desalentada.

## Positioning

Lo que una app CRUD armada rápido para reemplazar hojas de cálculo no podría reclamar honestamente: un Kardex append-only (las filas de `StockMovement` nunca se editan ni se borran; el stock siempre es `SUM()` del historial, ver [ADR 0001](../../docs/adr/0001-kardex-append-only.md)), RBAC reforzado por un guard reutilizable que revalida contra la base de datos en cada request (no solo contra el JWT), un `AuditLog` real con estado anterior/posterior en cada mutación, transacciones `Serializable` de Prisma en operaciones sensibles a concurrencia (ajustes de stock, cierre de órdenes de producción) probadas bajo carga concurrente real en tests e2e, y un costeo de producción por promedio ponderado que se deriva del mismo ledger de movimientos en vez de una estructura paralela de lotes. El producto y la disciplina de ingeniería son el mismo argumento: la corrección es estructural, no una checklist.

## Operating Context

Solo LAN, single-tenant, una sola empresa por despliegue — sin dependencia de internet/SaaS, sin multi-tenancy, sin proveedor de auth en la nube. El cliente de escritorio es Electron envolviendo una SPA de React (ruteo por hash, porque la app empaquetada carga desde `file://` sin servidor que resuelva rutas de historial en un refresh); habla con una API REST de NestJS por la LAN. Una sola cuenta de Administrador opera toda la app en una sola sesión; no hay modo offline — la app requiere que el backend esté alcanzable.

El flujo diario abarca inventario (bodegas, movimientos de stock, alertas de bajo stock), producción (receta/BOM, órdenes de producción, cierre) y, llegando en M5, compras (órdenes de compra, recepción de mercancía), ventas (pedidos, remisiones con estado de despacho/pago), clientes, proveedores y un dashboard de KPIs.

## Capabilities and Constraints

- El stock nunca es un campo editable directamente; siempre se deriva del historial de `StockMovement` (entradas/salidas/ajustes).
- Todo endpoint sensible está protegido por un guard RBAC reutilizable (`@Roles`/`@Permissions`), revalidado contra la base de datos en cada request.
- Toda mutación relevante escribe una entrada en `AuditLog` con el estado anterior y el nuevo.
- El costeo de producción es por promedio ponderado, no PEPS/por lotes — una simplificación deliberada que encaja con el ledger append-only sin necesitar una estructura nueva de lotes ([ADR 0002](../../docs/adr/0002-costeo-promedio-ponderado.md)).
- La receta de un producto terminado (`BillOfMaterials`) no está versionada/es histórica por diseño — una orden completada queda registrada como `StockMovement`s reales, no como una referencia a "qué versión de receta se usó".
- Abierto/sin decidir: si M5 agrega roles adicionales además de ADMIN, y si el precio específico por proveedor de un producto necesita su propio schema (surgió al definir el módulo de Proveedores, todavía sin resolver).

## Brand Commitments

Nombre del producto: **Opera**. El wordmark va en mayúsculas, tracking-widest, peso 400–500 (nunca bold). El logo es un cubo isométrico de 3 caras (`src/assets/opera-icon.svg`, reproducido inline en `Logo.tsx` en vez de cargarse como `<img>`) con una paleta de marca fija (`--brand-navy` / `--brand-blue` / `--brand-graphite`) deliberadamente separada del acento ámbar de la interfaz — ningún componente de UI debería usar los tokens de marca para nada que no sea el logo mismo.

## Evidence on Hand

No existen datos reales de empresas, clientes, ni cifras de uso — es una construcción desde cero, sin despliegue en vivo todavía. El trabajo futuro no debe inventar nombres de clientes, testimonios, casos de estudio, benchmarks ni precios; los estados vacíos/demo deben leerse como genuinamente vacíos, no poblados con empresas de ejemplo inventadas presentadas como reales.

## Product Principles

- La corrección es estructural, no procedimental: hacer imposible la acción incorrecta (editar stock, borrar un movimiento, cerrar una orden con stock insuficiente), no solo desalentarla por convención.
- Todo número en pantalla debe ser trazable al ledger o al audit trail que lo produjo — ningún campo que un usuario pueda sobreescribir a mano en silencio.
- Construir para el único rol de Administrador que existe hoy; dejar espacio para roles con permisos RBAC más adelante sin diseñar vistas especulativas para ellos ahora.
- Solo LAN y single-tenant es una restricción para diseñar dentro de ella, no un vacío para evadir — ninguna funcionalidad debería asumir alcance a internet o datos multi-empresa.
- Tratar el sistema de diseño existente (modo oscuro como referencia, paleta de marca, set de componentes — Card, Badge, Button, DataTable, Logo) como autoridad incumbente a extender, no a reemplazar, salvo que se pida explícitamente un rediseño.
