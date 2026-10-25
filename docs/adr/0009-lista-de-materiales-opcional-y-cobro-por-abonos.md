# ADR 0009: Lista de materiales opcional por producto y cobro por abonos

## Estado

Aceptada (2026-10-24, auditoría ronda 6).

## Contexto

Herrajes Toro fabrica sobre pedido: el cliente pide, el taller fabrica, se
despacha con una remisión y se cobra (de contado, por abonos o queda en
cartera). Desde el rediseño del ciclo de vida del pedido (commit `0170f6b`)
el pedido pasaba por PENDIENTE → EN_PRODUCCION → EN_ALMACEN, y al llegar a
almacén entraba al stock el producto terminado, pero:

1. **No se descontaba ninguna materia prima**, por una decisión registrada
   solo en ese mensaje de commit: el consumo "es demasiado variable entre
   pedidos y por la pérdida de material para calcularlo de forma confiable".
   Consecuencias que nunca quedaron escritas: el terminado entraba con costo
   0 (el inventario valorizado lo mostraba en $0), la materia prima solo
   bajaba con salidas manuales, y no había forma de saber cuánto costó
   fabricar un pedido.
2. **No existía ninguna forma de crear una lista de materiales**
   (`BillOfMaterials`): ni endpoint ni pantalla. Las órdenes de producción
   la exigen, así que ese módulo no se podía usar en una instalación real;
   el test de Playwright pasaba solo porque el fixture la insertaba con
   Prisma directo.
3. **El cobro era un campo que se sobreescribía**: `Remission.amountPaid` y
   `paymentStatus` se editaban a mano con `PATCH /remissions/:id/payment`.
   No quedaba cuándo pagó el cliente, cuánto en cada abono ni por qué medio,
   y el saldo del cliente sumaba también remisiones anuladas.

La dueña pidió que "el stock se mueva solo de acuerdo a lo que sale y
entra" y poder controlar el cobro de cada remisión.

## Decisión

**Lista de materiales opcional, por producto.** Cada producto terminado
puede tener (o no) una lista de materiales: qué materias primas e insumos
lleva **una** unidad (`PUT /products/:id/bill-of-materials`, pantalla en
Productos → Materiales). Solo admite materias primas e insumos — no
terminados dentro de otros terminados, para no tener que descontar listas
anidadas.

- Si el producto **tiene** lista, al pasar un pedido a almacén se
  descuentan sus materiales (SALIDA por componente al costo promedio
  vigente, ADR 0002) y el terminado entra con ese costo, todo en la misma
  transacción `Serializable` que ya movía el stock. Si falta material, el
  pedido no pasa a almacén y el error dice qué falta y cuánto; nunca se deja
  stock negativo (ADR 0001).
- Si **no tiene** lista, el comportamiento es exactamente el de antes:
  entra el terminado sin descontar nada y sin costo propio.

Esto respeta la decisión original para los productos donde el consumo es
impredecible (no se les carga lista) y automatiza los que sí tienen un
consumo estable. La misma lista sirve a las órdenes de producción.

**Cobro por abonos.** Cada pago es una fila de `RemissionPayment` (monto,
medio, fecha en que pagó el cliente, referencia, quién lo registró),
append-only como el Kardex: un abono mal registrado se anula con motivo, no
se borra. `Remission.amountPaid` y `paymentStatus` pasan a ser solo el
resumen de esos abonos, calculado por el backend en la misma transacción que
crea o anula el abono: PAGADO si lo abonado cubre el total, ABONADO si cubre
parte, CARTERA si nada. Nadie los elige a mano. `Remission.total` se fija al
crear la remisión (ni la remisión ni las líneas del pedido se editan, así
que no puede desincronizarse).

- No se puede abonar más que el saldo.
- No se puede anular una remisión con abonos vigentes: primero se anulan
  los abonos (y se registran en la remisión corregida). Si no, el saldo del
  cliente subiría como si nunca hubiera pagado.
- La migración convierte lo ya cobrado en un primer abono (medio OTRO,
  fecha de la remisión), para que el resumen siga coincidiendo con el
  historial.

**Estado DESPACHADO automático.** Cuando lo remisionado (sin anuladas)
cubre todas las líneas, el pedido pasa a DESPACHADO con `dispatchedAt`;
anular una remisión lo devuelve a EN_ALMACEN. Junto con `createdAt`,
`productionStartedAt` y `warehousedAt`, eso da el tiempo en cada estación
sin una tabla de historial aparte.

## Consecuencias

**A favor:**

- El stock de materia prima y el costo del terminado se mantienen solos
  para los productos con lista, sin tocar los que no la tienen.
- Producción vuelve a ser usable en una instalación real.
- El cobro es auditable: cada peso que entró tiene fecha, medio y quién lo
  registró; la cartera por cliente sale de ahí (`GET /reports/cartera`).

**En contra / costos aceptados:**

- Un producto con lista bloquea el paso a almacén si el stock de materiales
  está desactualizado. Es a propósito (el Kardex nunca queda negativo), pero
  obliga a registrar las compras antes de cerrar el pedido.
- La lista no es versionada (igual que antes, ver ADR 0002): cambiarla
  afecta a los pedidos que pasen a almacén después del cambio, no a los ya
  cerrados, que quedan registrados como movimientos reales.
- Los abonos migrados no tienen la fecha ni el medio reales — no existían.
