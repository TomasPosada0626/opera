# ADR 0011: IVA por pedido y remisión con el formato en papel de Herrajes Toro

## Estado

Aceptada.

## Contexto

Herrajes Toro ya tenía su remisión en papel: una plantilla de Excel con
consecutivo `HT` (iba en la HT 3285), datos del cliente (NIT, dirección,
teléfono, ciudad, país, celular, condiciones de pago, zona y asesor), una
tabla de productos con material, acabado, unidad de empaque (millar o
unidad), cantidad, precio y total, y abajo subtotal, IVA, total, la nota
"pasados 8 días no se aceptan reclamos ni devoluciones" y la firma del
cliente. La imprimen en una hoja carta vertical con dos copias, una para el
cliente y otra para la empresa, y la cortan por la mitad.

Opera imprimía una remisión propia, sin precios ni IVA, numerada desde 1, y
el cliente solo tenía nombre, NIT, correo, teléfono y dirección. Además, no
todas las ventas de la empresa llevan IVA.

## Decisión

- **IVA por pedido** (`Order.vatRate`, en porcentaje: 0 o 19). Se elige al
  crear el pedido y se puede cambiar solo mientras el pedido no tenga
  remisiones vigentes. Ni por producto ni por cliente: es la venta la que
  lleva o no lleva IVA.
- **Cada remisión guarda su subtotal, su IVA y su total**
  (`Remission.subtotal`, `vatAmount`, `total = subtotal + vatAmount`). El
  total, con IVA, es lo que el cliente debe: cartera, abonos y el saldo del
  cliente usan ese total, sin cambios en su lógica. Guardar el IVA calculado,
  y no solo la tarifa, hace que un cambio de tarifa algún día no reescriba
  remisiones viejas. Las remisiones anteriores quedaron con IVA 0.
- **Consecutivo `HT`**: en la base sigue siendo el `number` autoincremental;
  una migración lleva la secuencia a 3286 (sin bajarla si ya iba más
  adelante) y el prefijo `HT` es solo de presentación. La búsqueda acepta
  "HT 3286", "HT3286" o "3286".
- **Datos de la remisión en la ficha del cliente** (`city`, `country`,
  `mobile`, `zone`, `salesRep`, `paymentTerms`): texto libre, sin catálogos.
  Zona y asesor son nombres que usa el negocio, no usuarios de Opera.
- **Unidad de empaque** = la unidad del producto (millar o unidad); la
  columna UNIDAD es la cantidad y el precio del pedido es por esa unidad. No
  hace falta un campo nuevo.
- **La impresión** reproduce la plantilla: dos copias por hoja carta
  vertical, con línea de corte, filas vacías hasta completar el formato y la
  casilla del encabezado vacía, como en el papel. Si los productos no caben
  en media hoja, cada copia va en su hoja completa; nunca se corta ni se
  achica una línea. El mismo diseño está dos veces: en el escritorio
  (`RemissionSheet.tsx`, lo que se imprime) y en el PDF del backend
  (`remission-pdf.ts`), con las mismas medidas en puntos.

## Consecuencias

**A favor:**

- La empresa imprime desde Opera la misma hoja que ya usaba, con los datos
  completos y el consecutivo continuo.
- La cartera refleja lo que el cliente de verdad paga, con IVA incluido
  cuando corresponde.

**En contra / costos aceptados:**

- Opera sigue sin emitir factura electrónica: el IVA de la remisión es
  informativo para el cliente y para la cartera, no una liquidación ante la
  DIAN (eso sigue en el programa de facturación de la empresa).
- El formato está escrito dos veces (pantalla y PDF). Cambiar la plantilla
  exige tocar los dos archivos.
- Las tarifas posibles son 0 y 19 %. Una tarifa nueva (el 5 %, por ejemplo)
  se agrega en `orders/vat.ts` y en los selectores del escritorio.
