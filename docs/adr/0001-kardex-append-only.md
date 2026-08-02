# ADR 0001: Kardex como ledger append-only

## Estado

Aceptada.

## Contexto

El inventario es el módulo insignia de Opera. La alternativa más simple para modelarlo
sería un campo `stock` editable directamente en `Product` (o en una tabla
`ProductStock` por bodega): cada entrada, salida o ajuste sumaría o restaría ese
campo in situ. Es el enfoque que usan la mayoría de hojas de cálculo y sistemas
caseros — y es exactamente el problema que Opera busca resolver (ver
[Visión](../../README.md#visión)): cuando el stock es un número que cualquiera puede
sobreescribir, se pierde el historial de **por qué** cambió, **quién** lo cambió y
**cuándo**, y un error de captura no se puede distinguir de un ajuste intencional.

## Decisión

El stock nunca se guarda como un campo editable. Cada entrada, salida o ajuste de
inventario crea una fila nueva en `StockMovement` (id, productId, warehouseId, type,
quantity, reason, userId, createdAt) que **nunca se actualiza ni se borra** — de ahí
"append-only". El stock actual de un producto en una bodega es siempre una consulta
derivada: la suma de `quantity` de todos sus movimientos (ver #24), nunca un valor
almacenado que se sobreescribe.

`quantity` guarda el delta **con signo** (`ENTRADA` positivo, `SALIDA` negativo,
`AJUSTE` cualquiera) en vez de un valor siempre positivo con un `switch` sobre
`type` en cada consulta. Esto hace que el cálculo de stock sea una suma simple —
`SUM(quantity)` agrupado por `(productId, warehouseId)` — sin lógica condicional
repetida en cada lugar que necesite leer el stock.

Corregir un movimiento equivocado nunca edita la fila original: se registra un
movimiento `AJUSTE` nuevo (con `reason` obligatorio, ver #23) que compensa la
diferencia. El historial completo — incluyendo el error y su corrección — queda
visible.

## Consecuencias

**A favor:**

- Trazabilidad completa: para cualquier producto y bodega, la pregunta "¿por qué el
  stock es X?" siempre tiene respuesta en la tabla de movimientos, no solo en el
  número final.
- El stock nunca puede quedar en un estado inconsistente por una actualización
  parcial o una condición de carrera de tipo _lost update_ sobre un campo mutable —
  el peor caso es una fila de movimiento faltante o duplicada, nunca un contador
  corrupto sin explicación.
- El Kardex por producto (#26) y las alertas de bajo inventario (#67) se construyen
  sobre la misma fuente de verdad que ya existe, sin tablas derivadas que
  mantener sincronizadas.

**En contra / costos aceptados:**

- Calcular el stock actual siempre requiere una agregación (`SUM`) en vez de una
  lectura directa de un campo. Para catálogos grandes con historiales muy largos,
  esto es más costoso en cómputo que leer un entero — mitigable a futuro con una
  vista materializada o un snapshot cacheado si el volumen lo justifica, pero no
  se optimiza prematuramente ahora.
- Las operaciones que **deciden** algo basado en el stock actual antes de escribir
  (por ejemplo, `SALIDA` validando que hay suficiente disponible) tienen una
  ventana de condición de carrera real entre el `SELECT` y el `INSERT` si dos
  requests concurrentes leen el mismo stock antes de que cualquiera escriba — de
  ahí que #22, #23 y #25 usen transacciones de Prisma con nivel de aislamiento
  explícito, y #27 exista específicamente para probarlo bajo escrituras
  simultáneas.
