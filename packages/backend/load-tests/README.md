# Pruebas de carga

Mide latencia real de los endpoints de Kardex/reportes/dashboard contra un
dataset sintético multi-año, no contra la base vacía de desarrollo. El
riesgo que esto busca confirmar o descartar: `InventoryService.getAverageCost()`
recorre **todo** el historial de movimientos de un producto en cada llamada
(no hay costo materializado ni caché — ver el comentario en
`inventory.service.ts`), y tanto `/reports/inventario` como
`/dashboard/resumen` lo llaman una vez por producto activo. Con un catálogo
pequeño y poco historial (como el dataset de desarrollo) eso es invisible;
con años de operación real puede no serlo.

## Requisitos

- [k6](https://k6.io/) instalado (`k6 version`).
- Backend y Postgres corriendo localmente (`docker compose up -d`, luego
  `pnpm --filter backend start:dev` o `start:prod`).
- El límite global de requests/minuto por IP (`ThrottlerModule` en
  `app.module.ts`, 100/min por defecto) va a cortar cualquier corrida de k6
  con más de un puñado de VUs. Sube el techo solo para esta corrida local:

  ```
  RATE_LIMIT_PER_MINUTE=100000 pnpm --filter backend start:dev
  ```

  Nunca subas este valor en un despliegue real — el default (100) sigue
  siendo la protección contra fuerza bruta/abuso de la API.

## 1. Generar el dataset

```
pnpm --filter backend loadtest:seed
```

Por defecto genera 120 productos, ~400 movimientos de Kardex por producto
(~48.000 filas), 3.000 pedidos, 250 clientes, 40 proveedores y 1.500
compras, todos con marcador `LOADTEST`/SKU `LT-####` para poder borrarlos
limpio después. Ajustable con variables de entorno si quieres un dataset
más grande o más chico: `LOADTEST_PRODUCTS`, `LOADTEST_MOVEMENTS`,
`LOADTEST_ORDERS`, `LOADTEST_CUSTOMERS`, `LOADTEST_SUPPLIERS`,
`LOADTEST_PURCHASES`.

El script crea también un usuario ADMIN dedicado
(`loadtest-admin@opera.local`) y escribe `.dataset.json` (ignorado por git)
con sus credenciales y una muestra de ids de producto — los scripts de k6
lo leen directamente, no hace falta copiar nada a mano.

## 2. Correr k6

```
cd packages/backend
k6 run load-tests/k6/reports-and-kardex.js
```

Tres escenarios secuenciales (dashboard → reportes → kardex/stock, 30s cada
uno, concurrencia baja a propósito — ver el comentario en el script: Opera
es LAN-first para un solo local, el objetivo es medir latencia individual
con volumen real, no throughput masivo). Los thresholds fallan la corrida
si el p95 de algún endpoint se siente lento para una pantalla que alguien
está mirando en vivo.

Contra un backend remoto o un puerto distinto: `BASE_URL=http://host:puerto k6 run ...`.

## 3. Borrar el dataset

```
pnpm --filter backend loadtest:teardown
```

## Qué hacer con los resultados

Si `/dashboard/resumen` o `/reports/inventario` violan su threshold con el
dataset por defecto, el problema casi seguro es el recorrido completo de
`getAverageCost()` por producto — la solución de fondo es materializar
el costo promedio vigente (ej. una columna `Product.averageCost` que se
actualiza al escribir cada movimiento, en vez de recalcularse leyendo todo
el historial en cada consulta), no paralelizar más las llamadas actuales.
Esto es un cambio de diseño con su propio costo/riesgo — no se hace
preventivamente sin datos; este load test es lo que decide si vale la pena.

## Resultado de referencia (2026-08-27)

Corrida contra el dataset por defecto (120 productos, ~48.000 movimientos de
Kardex acumulados en 3 años simulados, 3.000 pedidos, 1.500 compras),
backend local + Postgres en Docker, sin nada más compitiendo por CPU:

| Endpoint                | avg    | p95    | Threshold | Resultado |
| ----------------------- | ------ | ------ | --------- | --------- |
| `/dashboard/resumen`    | 602 ms | 1.19 s | p95<2s    | ✅ pasa   |
| `/reports/inventario`   | 608 ms | 868 ms | p95<2s    | ✅ pasa   |
| `/inventory/:id/kardex` | 21 ms  | 43 ms  | p95<800ms | ✅ pasa   |
| `/inventory/:id/stock`  | 31 ms  | 22 ms  | p95<500ms | ✅ pasa   |

**Lectura:** el recorrido completo de `getAverageCost()` por producto es
real y medible — `/dashboard/resumen` y `/reports/inventario` son ~20-30×
más lentos que `/inventory/:id/kardex` (que sí está indexado y paginado)
aun con un catálogo modesto. Con el volumen actual (y el que Herrajes Toro
puede acumular en varios años más operando desde un solo local) el p95 se
mantiene bien dentro de lo que se siente instantáneo para una pantalla que
alguien mira mientras carga. **No se justifica materializar el costo
promedio todavía** — el costo de ese cambio (una columna que hay que
mantener consistente en cada escritura de Kardex, en vez de derivarla
siempre) es real y el load test no muestra un problema que lo justifique
hoy. Si el catálogo activo crece varias veces (cientos de productos) o el
historial por producto pasa de unos pocos miles de movimientos, vuelve a
correr este load test antes de decidir — los números de esta tabla son la
línea base para notar cuándo eso cambió, no una garantía permanente.
