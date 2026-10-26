import { useLayoutEffect, useRef, useState } from 'react';
import { formatMoney, formatQuantity, parseDateOnly } from '../../lib/format';
import { formatRemissionNumber } from '../../lib/remission-number';
import type { RemissionDetail } from '../../types/order';

// La remisión impresa con el formato en papel de Herrajes Toro (su plantilla
// de Excel), dos copias en una hoja carta vertical: arriba la del cliente,
// abajo la de la empresa, para cortarla por la mitad. Mismo diseño y mismas
// medidas (en puntos) que el PDF del backend (remissions/remission-pdf.ts).
//
// Si los productos no caben en media hoja, cada copia va en su propia hoja
// completa: se mide la primera copia ya dibujada, nunca se corta ni se
// achica una línea para que quepa.

const COPIES = ['Copia del cliente', 'Copia de la empresa'];

// Filas de producto (vacías incluidas, como en la plantilla) que caben en
// media hoja y en una hoja entera con el resto del formato.
const ROWS_HALF_SHEET = 16;
const ROWS_FULL_SHEET = 49;

export const RETURNS_NOTICE =
  'PASADOS 8 DÍAS NO SE ACEPTAN RECLAMOS NI DEVOLUCIONES DE MERCANCÍA';

// Medidas en pt para que pantalla e impresión coincidan con el PDF. Colores
// fijos (no los del tema): es papel, se ve igual con la app en modo oscuro.
const SHEET_CSS = `
@page { size: letter portrait; margin: 0; }
.remission-sheet {
  width: 612pt; background: #fff; color: #111827;
  font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt;
  /* Interlineado propio: el de la app (1.5) hacía cada renglón más alto
     que los 12-13 pt del formato y la copia ya no cabía en media hoja. */
  line-height: 1.15;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.18);
}
.remission-copy {
  position: relative; box-sizing: border-box; overflow: hidden;
  padding: 18pt 24pt 14pt; display: flex; flex-direction: column;
}
.remission-sheet[data-layout='half'] .remission-copy { height: 396pt; }
.remission-sheet[data-layout='full'] .remission-copy { min-height: 792pt; }
.remission-sheet[data-layout='full'] .remission-copy + .remission-copy {
  break-before: page;
}
/* La línea de corte va dentro de la primera copia (border-box): sumarla
   afuera empujaba la segunda copia unos puntos y la mandaba a otra hoja. */
.remission-copy--cut { border-bottom: 0.6pt dashed #6b7280; }
.remission-sheet table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.remission-sheet td, .remission-sheet th {
  border: 0.5pt solid #374151; padding: 0 3pt; height: 13pt;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font-weight: 400; text-align: left; line-height: 1.15;
}
.remission-sheet .label { font-size: 6.5pt; font-weight: 700; }
.remission-sheet .center { text-align: center; }
.remission-sheet .right { text-align: right; }
.remission-sheet .strong { font-weight: 700; }
.remission-header { display: flex; height: 34pt; border: 0.5pt solid #374151; margin-bottom: 4pt; }
.remission-header > div:first-child { width: 236pt; border-right: 0.5pt solid #374151; }
.remission-title { flex: 1; text-align: right; padding: 5pt 8pt 0; }
.remission-title h2 { font-size: 13pt; font-weight: 700; margin: 0; letter-spacing: 0; }
.remission-title p { font-size: 6.5pt; color: #6b7280; letter-spacing: 0.06em; margin: 2pt 0 0; }
.remission-void { color: #b91c1c; font-weight: 700; font-size: 9pt; margin-right: 8pt; }
.remission-info { margin-bottom: 4pt; }
.remission-items td { height: 12pt; }
.remission-items td.product { white-space: normal; padding-top: 1pt; padding-bottom: 1pt; }
.remission-sheet .remission-delivery { font-size: 8.5pt; font-weight: 700; text-align: center; }
.remission-sign td { height: 20pt; vertical-align: middle; }
.remission-sign td.signature { vertical-align: bottom; padding-bottom: 2pt; }
.remission-sheet .remission-total { font-size: 8.5pt; font-weight: 700; }
@media print {
  html, body { background: #fff !important; }
  .remission-sheet { box-shadow: none; }
}
`;

function formatDateNumeric(value: Date): string {
  return value.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function RemissionCopy({
  remission,
  copy,
  emptyRows,
  cutBelow = false,
}: {
  remission: RemissionDetail;
  copy: string;
  emptyRows: number;
  cutBelow?: boolean;
}) {
  const { order } = remission;
  const { customer } = order;
  const vatRate = Number(order.vatRate);

  return (
    <section
      className={`remission-copy${cutBelow ? ' remission-copy--cut' : ''}`}
      aria-label={copy}
    >
      <div className="remission-header">
        {/* La casilla de la izquierda queda vacía, como en la plantilla. */}
        <div />
        <div className="remission-title">
          <h2>
            {remission.voidedAt && (
              <span className="remission-void">ANULADA</span>
            )}
            REMISIÓN&nbsp;&nbsp;{formatRemissionNumber(remission.number)}
          </h2>
          <p>{copy.toUpperCase()}</p>
        </div>
      </div>

      <table className="remission-info">
        <colgroup>
          <col style={{ width: '62pt' }} />
          <col style={{ width: '120pt' }} />
          <col style={{ width: '34pt' }} />
          <col style={{ width: '58pt' }} />
          <col style={{ width: '64pt' }} />
          <col style={{ width: '126pt' }} />
          <col style={{ width: '100pt' }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="label">FECHA</td>
            <td colSpan={3}>
              {formatDateNumeric(new Date(remission.createdAt))}
            </td>
            <td className="label">PEDIDO</td>
            <td>No. {order.number}</td>
            <td className="label center" rowSpan={2}>
              FECHA DE ENTREGA
            </td>
          </tr>
          <tr>
            <td className="label">CLIENTE</td>
            <td colSpan={3}>{customer.name}</td>
            <td className="label">NIT</td>
            <td>{customer.taxId ?? ''}</td>
          </tr>
          <tr>
            <td className="label">DIRECCIÓN</td>
            <td colSpan={3}>{customer.address ?? ''}</td>
            <td className="label">TELÉFONO</td>
            <td>{customer.phone ?? ''}</td>
            <td className="remission-delivery" rowSpan={3}>
              {order.estimatedDeliveryDate
                ? formatDateNumeric(parseDateOnly(order.estimatedDeliveryDate))
                : ''}
            </td>
          </tr>
          <tr>
            <td className="label">CIUDAD</td>
            <td>{customer.city ?? ''}</td>
            <td className="label center">PAÍS</td>
            <td>{customer.country ?? ''}</td>
            <td className="label">CELULAR</td>
            <td>{customer.mobile ?? ''}</td>
          </tr>
          <tr>
            <td className="label" colSpan={2}>
              CONDICIONES DE PAGO
            </td>
            <td colSpan={4}>{customer.paymentTerms ?? ''}</td>
          </tr>
        </tbody>
      </table>

      <table className="remission-items">
        <colgroup>
          <col style={{ width: '176pt' }} />
          <col style={{ width: '72pt' }} />
          <col style={{ width: '72pt' }} />
          <col style={{ width: '52pt' }} />
          <col style={{ width: '52pt' }} />
          <col style={{ width: '66pt' }} />
          <col style={{ width: '74pt' }} />
        </colgroup>
        <thead>
          <tr>
            {[
              'PRODUCTO',
              'MATERIAL',
              'ACABADO',
              'UNID EMP',
              'UNIDAD',
              'PRECIO',
              'TOTAL',
            ].map((title) => (
              <th key={title} className="label center">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {remission.items.map((item) => {
            const { product, unitPrice } = item.orderItem;
            return (
              <tr key={item.id}>
                <td className="product">
                  {product.sku} — {product.name}
                </td>
                <td>{product.material ?? ''}</td>
                <td>{product.finish ?? ''}</td>
                <td className="center">{product.unit.name}</td>
                <td className="right">{formatQuantity(item.quantity)}</td>
                <td className="right">{formatMoney(unitPrice)}</td>
                <td className="right strong">
                  {formatMoney(Number(item.quantity) * Number(unitPrice))}
                </td>
              </tr>
            );
          })}
          {Array.from({ length: emptyRows }, (_, index) => (
            <tr key={`empty-${index}`} data-empty-row="">
              {Array.from({ length: 7 }, (__, cell) => (
                <td key={cell} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <table>
        <colgroup>
          <col style={{ width: '196pt' }} />
          <col style={{ width: '34pt' }} />
          <col style={{ width: '70pt' }} />
          <col style={{ width: '40pt' }} />
          <col style={{ width: '84pt' }} />
          <col style={{ width: '66pt' }} />
          <col style={{ width: '74pt' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={5} />
            <td className="label">SUBTOTAL</td>
            <td className="right">{formatMoney(remission.subtotal)}</td>
          </tr>
          <tr>
            <td className="label" colSpan={5}>
              {RETURNS_NOTICE}
            </td>
            <td className="label">{vatRate > 0 ? `IVA ${vatRate}%` : 'IVA'}</td>
            <td className="right">
              {vatRate > 0 ? formatMoney(remission.vatAmount) : ''}
            </td>
          </tr>
          <tr className="remission-sign">
            <td className="label signature">FIRMA CLIENTE</td>
            <td className="label">ZONA</td>
            <td>{customer.zone ?? ''}</td>
            <td className="label">ASESOR</td>
            <td>{customer.salesRep ?? ''}</td>
            <td className="label">TOTAL</td>
            <td className="right remission-total">
              {formatMoney(remission.total)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export function RemissionSheet({ remission }: { remission: RemissionDetail }) {
  const [layout, setLayout] = useState<'half' | 'full'>('half');
  const firstCopyRef = useRef<HTMLDivElement>(null);

  // Si con media hoja la primera copia se desborda (nombres largos que
  // ocupan dos renglones, muchos productos), cada copia pasa a hoja entera.
  useLayoutEffect(() => {
    const copy = firstCopyRef.current?.querySelector('.remission-copy');
    if (
      layout === 'half' &&
      copy instanceof HTMLElement &&
      copy.scrollHeight > copy.clientHeight + 1
    ) {
      setLayout('full');
    }
  }, [layout, remission]);

  const rows = layout === 'half' ? ROWS_HALF_SHEET : ROWS_FULL_SHEET;
  const emptyRows = Math.max(0, rows - remission.items.length);

  return (
    <>
      <style>{SHEET_CSS}</style>
      <div className="remission-sheet" data-layout={layout}>
        <div ref={firstCopyRef}>
          <RemissionCopy
            remission={remission}
            copy={COPIES[0]}
            emptyRows={emptyRows}
            cutBelow={layout === 'half'}
          />
        </div>
        <RemissionCopy
          remission={remission}
          copy={COPIES[1]}
          emptyRows={emptyRows}
        />
      </div>
    </>
  );
}
