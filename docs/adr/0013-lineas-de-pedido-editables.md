# ADR 0013: Líneas de pedido editables

## Estado

Aceptada.

## Contexto

Las líneas de un pedido no se podían cambiar después de crearlo. Cuando el
cliente llamaba a pedir extras o una cantidad quedaba mal, Herrajes Toro
terminaba anulando remisiones o montando otro pedido. Quiere editar cada
línea del pedido y que el valor, la producción y lo demás se ajusten solos.

## Decisión

- **`PUT /orders/:id/items`** recibe la lista completa de líneas. Una línea
  con `id` se actualiza (cantidad y precio; el producto no cambia), una sin
  `id` es nueva y la que no viene se quita. Solo ADMIN, y nunca en un
  pedido cancelado.
- **Límites:**
  - La cantidad no baja de lo ya despachado en remisiones vigentes.
  - El precio solo cambia en líneas sin despachos, porque cada remisión
    guardó su total con el precio de entonces.
  - No se quita una línea con remisiones, aunque estén anuladas.
- **Producción por diferencia:** si el pedido ya pasó a producción, lo que
  cambia en una línea se lleva a sus órdenes de producción. Nunca se
  recalcula desde cero, así un pedido viejo sin órdenes no vuelve a
  producirse entero.
  - Lo agregado suma a la orden pendiente de la línea, o abre una nueva solo
    por lo agregado si ya se produjo. Una línea puede tener varias órdenes:
    `orderItemId` deja de ser único.
  - Lo quitado resta de lo pendiente, y las órdenes que quedan en cero se
    cancelan. Lo ya producido no se toca, porque es inventario real.
  - Una línea nueva se manda entera a producción; una quitada cancela lo
    que tenía pendiente.
- **Estado del pedido:** con algo pendiente por producir vuelve (o sigue) en
  `EN_PRODUCCION`. Si no queda nada pendiente, pasa a `EN_ALMACEN`, o a
  `DESPACHADO` si lo remisionado ya cubre todas las líneas.
- **Orden de las líneas:** `OrderItem.position` guarda el orden. La
  migración lo llena con el orden en que se crearon. Al editar, las líneas
  quedan en el orden del formulario.
- Todo corre en una transacción Serializable, y los conflictos con
  remisiones o completados simultáneos responden 409. Queda en auditoría
  como `UPDATE_ITEMS`, con las líneas de antes y después.

## Consecuencias

- Pedir extras ya no obliga a anular remisiones ni a crear otro pedido.
- Un pedido en almacén o despachado que recibe extras vuelve a producción y
  no se puede remisionar hasta completar lo nuevo. Si hay algo listo para
  despachar, conviene hacer esa remisión antes de agregar los extras.
- Bajar una cantidad después de producida deja ese sobrante en inventario,
  sin atarlo al pedido.
