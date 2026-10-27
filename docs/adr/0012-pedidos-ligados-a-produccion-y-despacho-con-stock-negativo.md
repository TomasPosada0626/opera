# ADR 0012: Pedidos ligados a producción y despacho aunque quede stock negativo

## Estado

Aceptada.

## Contexto

Pedidos y producción iban separados. El pedido pasaba a almacén con un
botón a mano, y una orden de producción exigía lista de materiales.
Herrajes Toro no registra materias primas. Quiere un solo flujo: crear el
pedido, enviarlo a producción, completarlo ahí indicando cuántas piezas
salieron buenas (puede haber dañadas) y despachar con la remisión. Además,
la remisión debe descontar lo despachado aunque el inventario no alcance.

## Decisión

- **Enviar a producción** crea, en la misma transacción, una
  `ProductionOrder` por línea del pedido (`orderId`, `orderItemId`), que
  aparece en la pestaña Producción.
- **Completar** pide `producedQuantity`: lo que salió bueno. Es lo único
  que entra al inventario. Cuando un pedido ya no tiene órdenes pendientes,
  pasa solo a `EN_ALMACEN`. Ya no hay botón de "pasar a almacén"; el
  endpoint `mark-warehoused` queda como atajo y completa todo con lo
  planeado.
- **La lista de materiales es opcional también en producción.** Sin ella
  no se descuenta nada y el terminado entra sin costo propio.
- **Cancelar el pedido** cancela sus órdenes pendientes. Una orden de un
  pedido no se cancela sola.
- **La remisión ya no valida stock**: la `SALIDA` siempre se escribe, y si
  no alcanzaba el inventario queda en negativo. El costo promedio ya no
  mezcla un saldo negativo: con stock en 0 o menos, la entrada siguiente
  fija el costo.
- **Migración:** los pedidos que ya estaban en producción reciben sus
  órdenes, y las órdenes ya completadas quedan con
  `producedQuantity = quantity`.

## Consecuencias

- Un solo camino del pedido al despacho, sin pasos a mano entre pestañas.
- El inventario puede quedar en negativo. Es intencional: refleja que se
  despachó más de lo registrado, y se corrige con un ajuste.
- La salida manual de inventario (Inventario → Salida) sigue sin permitir
  negativos; solo la remisión los permite.
