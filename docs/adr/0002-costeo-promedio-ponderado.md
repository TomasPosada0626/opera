# ADR 0002: Costeo de producción por promedio ponderado

## Estado

Aceptada.

## Contexto

Al completar una orden de producción (#33), Opera necesita saber cuánto costó producir
cada unidad del producto terminado, a partir del costo de las materias primas
consumidas (según la receta, #29). Las dos alternativas estándar para esto son:

- **PEPS (FIFO)**: cada entrada de inventario es un lote con su propio costo unitario;
  al consumir, se descuenta primero del lote más antiguo disponible, y el costo de la
  salida es el de ese lote (o una mezcla de varios, si el lote más antiguo no alcanza).
- **Promedio ponderado**: se mantiene un costo unitario promedio por producto,
  recalculado en cada entrada (`nuevoPromedio = (stockActual × promedioActual +
cantidadEntrante × costoEntrante) / (stockActual + cantidadEntrante)`); toda salida
  se costea al promedio vigente en ese momento.

El Kardex de Opera (ver [ADR 0001](0001-kardex-append-only.md)) es deliberadamente
simple: `StockMovement` es un ledger de deltas con signo, y el stock siempre se deriva
como `SUM(quantity)` — sin lotes, sin orden de consumo explícito, sin necesidad de
saber "qué entrada específica cubre esta salida".

## Decisión

Opera costea por **promedio ponderado**, no PEPS.

PEPS requiere trazar el inventario por **lotes** (qué entrada específica se está
consumiendo en cada salida) para poder aplicar el costo correcto a cada unidad
consumida — eso es información que el modelo actual de `StockMovement` no guarda ni
necesita para calcular el stock. Adoptar PEPS obligaría a añadir una estructura de
lotes (o una cola FIFO por producto/bodega) puramente para el costeo, duplicando en
los hechos el mismo ledger con una segunda responsabilidad — justo el tipo de tabla
derivada que el ADR 0001 evita a propósito.

El promedio ponderado, en cambio, encaja con el modelo existente sin cambiarlo: solo
necesita saber el costo promedio vigente al momento de cada consumo, que se puede
derivar (o mantener incrementalmente) a partir de las mismas filas de `StockMovement`
más un campo de costo unitario en las entradas — sin lotes, sin orden de consumo, sin
romper la simplicidad de "stock = suma de movimientos".

Consecuencia directa de implementación (#34, no de este ADR): `StockMovement` necesita
un campo de costo unitario (nullable — solo aplica a `ENTRADA`, no a `SALIDA`/`AJUSTE`,
que se costean leyendo el promedio vigente, no registrando uno propio).

## Consecuencias

**A favor:**

- Compatible con el ledger append-only existente sin necesidad de una estructura de
  lotes nueva — el costeo se apoya en los mismos `StockMovement` que ya son la fuente
  de verdad del stock.
- Más simple de auditar: un solo número (el promedio vigente) explica el costo de
  cualquier salida en un momento dado, en vez de tener que reconstruir qué mezcla de
  lotes la compuso.
- Es el método más común en PyMEs manufactureras (el público objetivo de Opera, ver
  [Visión](../../README.md#visión)) frente a sistemas de costeo por lote más propios de
  operaciones con alta rotación y trazabilidad regulatoria estricta (farmacéutica,
  alimentos perecederos con vencimiento por lote).

**En contra / costos aceptados:**

- Menos preciso que PEPS cuando los costos de materia prima fluctúan mucho: el
  promedio ponderado "suaviza" el costo real de cada salida en vez de reflejar
  exactamente qué lote (más barato o más caro) se consumió.
- No sirve tal cual para negocios que necesiten trazabilidad por lote con fecha de
  vencimiento o número de lote de proveedor — si Opera algún día necesita eso, sería
  una funcionalidad nueva y explícita, no una extensión natural de este esquema.
- Requiere mantener el promedio de forma consistente ante escrituras concurrentes
  (dos entradas del mismo producto casi simultáneas): mismo tipo de condición de
  carrera que ya resuelven las transacciones `Serializable` de #22/#23/#25, aplicado
  ahora también al cálculo/actualización del costo promedio en #34.
