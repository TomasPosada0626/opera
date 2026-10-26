# ADR 0010: Compras con varias líneas, recepción parcial y cuentas por pagar

## Estado

Aceptada (2026-10-25).

## Contexto

Las compras a proveedores eran una bitácora (`SupplierPurchase`): un
producto por registro, sin pagos y con una recepción de todo o nada
(`POST /supplier-purchases/:id/receive` escribía la ENTRADA por la cantidad
completa). En el día a día de Herrajes Toro eso no alcanzaba:

1. **Una compra real trae varios productos** (lámina, tornillos, cajas) en
   una misma factura del proveedor. Había que registrarlos por separado y
   no quedaba nada que los agrupara.
2. **La mercancía llega por partes.** Sin recepción parcial, o se esperaba
   a que llegara todo (y el stock real quedaba atrasado) o se recibía todo
   de una vez (y el stock quedaba adelantado).
3. **No había cuentas por pagar.** El negocio controlaba lo que le deben
   los clientes (cartera, ADR 0009) pero no lo que les debe a sus
   proveedores, ni cuándo les pagó.

Dos decisiones del negocio enmarcan el diseño (2026-10-25):

- **La factura electrónica (DIAN) se hace en el programa de facturación
  que ya usan.** Opera no emite facturas ni liquida IVA; de la factura del
  proveedor solo guarda el número, para poder cruzarla.
- **Una sola fábrica.** Hay una sola bodega; la compra igual la registra
  (el modelo ya soporta varias), pero la interfaz no la muestra.

## Decisión

**`PurchaseOrder` con líneas (`PurchaseOrderItem`).** Consecutivo legible
(`number`, "Compra No. 12"), proveedor, bodega de destino, fecha esperada,
número de factura del proveedor y notas. El `total` (lo pedido) queda fijo
al crear, igual que `Remission.total`. Las líneas y los costos no se editan
después; solo los datos de seguimiento.

**Recepción parcial que mueve el Kardex.** Cada llegada de mercancía de una
línea es un `PurchaseReceipt` atado a una ENTRADA real del Kardex con el
costo de la compra (entra al promedio ponderado, ADR 0002). La ENTRADA no se
fecha hacia atrás aunque se declare otra fecha de llegada: el Kardex se lee
en el orden en que se escribió (ADR 0001); la fecha declarada queda en el
recibo. La recepción corre en una transacción Serializable para que dos
recepciones simultáneas no reciban de más. Estados: `PENDIENTE` → `PARCIAL`
→ `RECIBIDA`, o `CANCELADA` (solo sin nada recibido ni pagos vigentes).

**Cerrar con lo recibido.** Si el proveedor no va a mandar el resto, una
compra `PARCIAL` se cierra (`CERRADA`) y su `total` pasa a ser el valor de
lo que llegó: es lo que el proveedor va a cobrar. No se puede cerrar si lo
pagado supera lo recibido.

**Pagos al proveedor (`SupplierPayment`).** Mismo diseño que los abonos de
remisiones: monto, medio, fecha y referencia; append-only, se anulan con
motivo. `amountPaid` se mantiene en la misma transacción. Se puede pagar por
adelantado, pero nunca más que el total de la compra.

**Por pagar = lo recibido menos lo pagado, nunca negativo.** Lo pedido y no
recibido todavía no es deuda; un anticipo por encima de lo recibido tampoco
es deuda (se muestra aparte como anticipo). La regla vive en un solo lugar
(`purchase-orders/payables.ts`) y la usan el detalle de la compra, el saldo
del proveedor (`GET /suppliers/:id/balance`), el reporte de cuentas por
pagar con antigüedad (`GET /reports/por-pagar`, + Excel) y el dashboard. La
antigüedad de una deuda cuenta desde la primera recepción de la compra.

**Migración de la bitácora.** Cada `SupplierPurchase` pasa a ser una compra
de una línea con `tracksPayment = false` ("histórica"): la bitácora nunca
llevó pagos, así que contarlas como deuda inventaría plata que nadie debe.
Las recibidas quedan `RECIBIDA` con su recepción atada a la ENTRADA que ya
existía; las de antes de la recepción (sin bodega, su stock se cargó a mano)
quedan `RECIBIDA` sin recepción, para que nadie las reciba dos veces; las
pendientes con bodega quedan `PENDIENTE`. Después se borra la tabla vieja.

## Consecuencias

- El stock de materia prima sube solo al recibir, con el costo real de cada
  compra, y el inventario valorizado lo refleja.
- La dueña ve cuánto le debe a cada proveedor y desde cuándo, igual que ve
  la cartera de sus clientes.
- Las compras migradas no aparecen en cuentas por pagar ni aceptan pagos;
  si alguna de ellas en realidad se debe, se registra como compra nueva.
- No hay IVA ni retenciones en la compra: el valor es el que se pacta con el
  proveedor, y la contabilidad formal sigue en el programa de facturación.
