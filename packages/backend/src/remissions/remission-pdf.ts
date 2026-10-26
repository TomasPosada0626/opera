import PDFDocument from 'pdfkit';
import { formatRemissionNumber } from './remission-number';

// La remisión impresa con el formato en papel de Herrajes Toro (su plantilla
// de Excel): encabezado, datos del cliente, tabla de productos y, abajo,
// subtotal, IVA, total, la nota de reclamos, firma, zona y asesor. Una hoja
// carta (612 × 792 pt) partida en dos: arriba la copia del cliente, abajo
// la de la empresa — la imprimen y la cortan por la mitad. Mismo diseño que
// la pantalla de impresión del escritorio (PrintRemissionPage.tsx).
//
// Si los productos no caben en media hoja, cada copia va en su propia hoja
// completa (y sigue en otra si hace falta): nunca se corta ni se achica una
// línea para que quepa.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const HALF_HEIGHT = PAGE_HEIGHT / 2;
const MARGIN_X = 24;
const WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TOP_PADDING = 18;
const BOTTOM_PADDING = 14;

const HEADER_HEIGHT = 34;
const HEADER_LOGO_WIDTH = 236;
const INFO_ROW_HEIGHT = 13;
const GAP = 4;
const TABLE_HEADER_HEIGHT = 13;
const MIN_ROW_HEIGHT = 12;
const TOTALS_ROW_HEIGHT = 13;
const SIGNATURE_ROW_HEIGHT = 20;
const TOTALS_HEIGHT = TOTALS_ROW_HEIGHT * 2 + SIGNATURE_ROW_HEIGHT;
const CELL_PADDING = 3;

const LABEL_SIZE = 6.5;
const VALUE_SIZE = 7.5;

const INK = '#111827';
const MUTED = '#6b7280';
const BORDER = '#374151';

// Columnas de la tabla, en el orden de la plantilla. Suman WIDTH.
const COLUMNS = [
  { title: 'PRODUCTO', width: 176, align: 'left' },
  { title: 'MATERIAL', width: 72, align: 'left' },
  { title: 'ACABADO', width: 72, align: 'left' },
  { title: 'UNID EMP', width: 52, align: 'center' },
  { title: 'UNIDAD', width: 52, align: 'right' },
  { title: 'PRECIO', width: 66, align: 'right' },
  { title: 'TOTAL', width: 74, align: 'right' },
] as const;
const AMOUNT_LABEL_WIDTH = COLUMNS[5].width;
const AMOUNT_VALUE_WIDTH = COLUMNS[6].width;
const AMOUNTS_X = MARGIN_X + WIDTH - AMOUNT_LABEL_WIDTH - AMOUNT_VALUE_WIDTH;

const COPIES = ['Copia del cliente', 'Copia de la empresa'];

export const RETURNS_NOTICE =
  'PASADOS 8 DÍAS NO SE ACEPTAN RECLAMOS NI DEVOLUCIONES DE MERCANCÍA';

type Amount = { toString(): string };

export interface RemissionForPdf {
  number: number;
  createdAt: Date;
  voidedAt: Date | null;
  subtotal: Amount;
  vatAmount: Amount;
  total: Amount;
  order: {
    number: number;
    vatRate: Amount;
    estimatedDeliveryDate: Date | null;
    customer: {
      name: string;
      taxId: string | null;
      address: string | null;
      phone: string | null;
      city: string | null;
      country: string | null;
      mobile: string | null;
      zone: string | null;
      salesRep: string | null;
      paymentTerms: string | null;
    };
  };
  items: {
    quantity: Amount;
    orderItem: {
      unitPrice: Amount;
      product: {
        sku: string;
        name: string;
        material: string | null;
        finish: string | null;
        unit: { name: string };
      };
    };
  }[];
}

interface Row {
  cells: string[];
  height: number;
}

type Align = 'left' | 'center' | 'right';

interface CellOptions {
  bold?: boolean;
  size?: number;
  align?: Align;
  color?: string;
  wrap?: boolean;
}

function formatMoney(value: Amount): string {
  const amount = Number(value.toString());
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return `$ ${amount.toLocaleString('es-CO', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: Amount): string {
  return Number(value.toString()).toLocaleString('es-CO', {
    maximumFractionDigits: 3,
  });
}

// Fecha de calendario (dd/mm/aaaa). `utc`: estimatedDeliveryDate es un
// DATE guardado como medianoche UTC, que en hora de Colombia caería el día
// anterior.
function formatDate(value: Date, utc = false): string {
  return value.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(utc ? { timeZone: 'UTC' } : {}),
  });
}

function cell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  options: CellOptions = {},
): void {
  doc.lineWidth(0.5).strokeColor(BORDER).rect(x, y, width, height).stroke();
  if (!text) {
    return;
  }
  const size = options.size ?? VALUE_SIZE;
  doc
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(options.color ?? INK);
  const textWidth = width - CELL_PADDING * 2;
  if (options.wrap) {
    doc.text(text, x + CELL_PADDING, y + CELL_PADDING, {
      width: textWidth,
      align: options.align ?? 'left',
    });
    return;
  }
  doc.text(text, x + CELL_PADDING, y + (height - size) / 2 + 0.5, {
    width: textWidth,
    height: size + 2,
    align: options.align ?? 'left',
    ellipsis: true,
    lineBreak: false,
  });
}

function label(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  align: Align = 'left',
): void {
  cell(doc, x, y, width, height, text, {
    bold: true,
    size: LABEL_SIZE,
    align,
  });
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  remission: RemissionForPdf,
  copy: string,
  top: number,
): number {
  // La casilla de la izquierda queda vacía, como en la plantilla en papel.
  doc
    .lineWidth(0.5)
    .strokeColor(BORDER)
    .rect(MARGIN_X, top, HEADER_LOGO_WIDTH, HEADER_HEIGHT)
    .stroke()
    .rect(
      MARGIN_X + HEADER_LOGO_WIDTH,
      top,
      WIDTH - HEADER_LOGO_WIDTH,
      HEADER_HEIGHT,
    )
    .stroke();
  const titleX = MARGIN_X + HEADER_LOGO_WIDTH + 10;
  const titleWidth = WIDTH - HEADER_LOGO_WIDTH - 20;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK);
  doc.text(
    `REMISIÓN  ${formatRemissionNumber(remission.number)}`,
    titleX,
    top + 7,
    { width: titleWidth, align: 'right', lineBreak: false },
  );
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED);
  doc.text(copy.toUpperCase(), titleX, top + 23, {
    width: titleWidth,
    align: 'right',
    lineBreak: false,
    characterSpacing: 0.5,
  });
  if (remission.voidedAt) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c');
    doc.text('ANULADA', titleX, top + 12, { lineBreak: false });
  }
  return top + HEADER_HEIGHT + GAP;
}

function drawInfo(
  doc: PDFKit.PDFDocument,
  remission: RemissionForPdf,
  top: number,
): number {
  const { customer } = remission.order;
  const h = INFO_ROW_HEIGHT;
  const l1 = 62;
  const v1 = 212;
  const l2 = 64;
  const v2 = 126;
  const right = WIDTH - l1 - v1 - l2 - v2;
  const x1 = MARGIN_X;
  const x2 = x1 + l1;
  const x3 = x2 + v1;
  const x4 = x3 + l2;
  const x5 = x4 + v2;

  const rows: [string, string, string, string][] = [
    [
      'FECHA',
      formatDate(remission.createdAt),
      'PEDIDO',
      `No. ${remission.order.number}`,
    ],
    ['CLIENTE', customer.name, 'NIT', customer.taxId ?? ''],
    ['DIRECCIÓN', customer.address ?? '', 'TELÉFONO', customer.phone ?? ''],
  ];
  rows.forEach(([name, value, name2, value2], index) => {
    const y = top + index * h;
    label(doc, x1, y, l1, h, name);
    cell(doc, x2, y, v1, h, value);
    label(doc, x3, y, l2, h, name2);
    cell(doc, x4, y, v2, h, value2);
  });

  // Ciudad y país comparten la columna de valores, como en la plantilla.
  const cityY = top + 3 * h;
  const cityWidth = 120;
  const countryLabelWidth = 34;
  label(doc, x1, cityY, l1, h, 'CIUDAD');
  cell(doc, x2, cityY, cityWidth, h, customer.city ?? '');
  label(doc, x2 + cityWidth, cityY, countryLabelWidth, h, 'PAÍS', 'center');
  cell(
    doc,
    x2 + cityWidth + countryLabelWidth,
    cityY,
    v1 - cityWidth - countryLabelWidth,
    h,
    customer.country ?? '',
  );
  label(doc, x3, cityY, l2, h, 'CELULAR');
  cell(doc, x4, cityY, v2, h, customer.mobile ?? '');

  const termsY = top + 4 * h;
  label(doc, x1, termsY, l1 + 40, h, 'CONDICIONES DE PAGO');
  cell(doc, x2 + 40, termsY, v1 - 40 + l2 + v2, h, customer.paymentTerms ?? '');

  // Fecha de entrega: la casilla de la derecha, a lo alto de las 5 filas.
  label(doc, x5, top, right, h * 2, 'FECHA DE ENTREGA', 'center');
  cell(
    doc,
    x5,
    top + h * 2,
    right,
    h * 3,
    remission.order.estimatedDeliveryDate
      ? formatDate(remission.order.estimatedDeliveryDate, true)
      : '',
    { bold: true, align: 'center', size: 8.5 },
  );

  return top + h * 5 + GAP;
}

function drawTableHeader(doc: PDFKit.PDFDocument, top: number): number {
  let x = MARGIN_X;
  for (const column of COLUMNS) {
    label(
      doc,
      x,
      top,
      column.width,
      TABLE_HEADER_HEIGHT,
      column.title,
      'center',
    );
    x += column.width;
  }
  return top + TABLE_HEADER_HEIGHT;
}

function drawRow(doc: PDFKit.PDFDocument, row: Row, top: number): void {
  let x = MARGIN_X;
  COLUMNS.forEach((column, index) => {
    cell(doc, x, top, column.width, row.height, row.cells[index] ?? '', {
      align: column.align,
      wrap: index === 0,
      bold: index === COLUMNS.length - 1,
    });
    x += column.width;
  });
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  remission: RemissionForPdf,
  top: number,
): void {
  const h = TOTALS_ROW_HEIGHT;
  const leftWidth = AMOUNTS_X - MARGIN_X;
  const vatRate = Number(remission.order.vatRate.toString());

  cell(doc, MARGIN_X, top, leftWidth, h, '');
  label(doc, AMOUNTS_X, top, AMOUNT_LABEL_WIDTH, h, 'SUBTOTAL');
  cell(
    doc,
    AMOUNTS_X + AMOUNT_LABEL_WIDTH,
    top,
    AMOUNT_VALUE_WIDTH,
    h,
    formatMoney(remission.subtotal),
    { align: 'right' },
  );

  const vatY = top + h;
  cell(doc, MARGIN_X, vatY, leftWidth, h, RETURNS_NOTICE, {
    bold: true,
    size: 6.5,
  });
  label(
    doc,
    AMOUNTS_X,
    vatY,
    AMOUNT_LABEL_WIDTH,
    h,
    vatRate > 0 ? `IVA ${vatRate}%` : 'IVA',
  );
  cell(
    doc,
    AMOUNTS_X + AMOUNT_LABEL_WIDTH,
    vatY,
    AMOUNT_VALUE_WIDTH,
    h,
    vatRate > 0 ? formatMoney(remission.vatAmount) : '',
    { align: 'right' },
  );

  // Firma del cliente, zona y asesor: la fila más alta, para firmar.
  const signY = vatY + h;
  const sh = SIGNATURE_ROW_HEIGHT;
  const { customer } = remission.order;
  const signatureWidth = COLUMNS[0].width + 20;
  const zoneLabelWidth = 34;
  const zoneWidth = 70;
  const repLabelWidth = 40;
  const repWidth =
    leftWidth - signatureWidth - zoneLabelWidth - zoneWidth - repLabelWidth;
  let x = MARGIN_X;
  doc
    .lineWidth(0.5)
    .strokeColor(BORDER)
    .rect(x, signY, signatureWidth, sh)
    .stroke();
  doc.font('Helvetica-Bold').fontSize(LABEL_SIZE).fillColor(INK);
  doc.text('FIRMA CLIENTE', x + CELL_PADDING, signY + sh - LABEL_SIZE - 3, {
    lineBreak: false,
  });
  x += signatureWidth;
  label(doc, x, signY, zoneLabelWidth, sh, 'ZONA');
  x += zoneLabelWidth;
  cell(doc, x, signY, zoneWidth, sh, customer.zone ?? '');
  x += zoneWidth;
  label(doc, x, signY, repLabelWidth, sh, 'ASESOR');
  x += repLabelWidth;
  cell(doc, x, signY, repWidth, sh, customer.salesRep ?? '');
  label(doc, AMOUNTS_X, signY, AMOUNT_LABEL_WIDTH, sh, 'TOTAL');
  cell(
    doc,
    AMOUNTS_X + AMOUNT_LABEL_WIDTH,
    signY,
    AMOUNT_VALUE_WIDTH,
    sh,
    formatMoney(remission.total),
    { bold: true, align: 'right', size: 8.5 },
  );
}

// Una copia entre `top` y `bottom` (media hoja o una hoja entera). Las
// filas vacías completan el espacio hasta los totales, como en la
// plantilla; en hoja entera, si las filas no caben, la tabla sigue en una
// hoja nueva y los totales van en la última.
function drawCopy(
  doc: PDFKit.PDFDocument,
  remission: RemissionForPdf,
  rows: Row[],
  copy: string,
  top: number,
  bottom: number,
): void {
  let y = drawHeader(doc, remission, copy, top + TOP_PADDING);
  y = drawInfo(doc, remission, y);
  y = drawTableHeader(doc, y);

  let pageBottom = bottom;
  const totalsTop = () => pageBottom - BOTTOM_PADDING - TOTALS_HEIGHT;
  for (const row of rows) {
    if (y + row.height > totalsTop()) {
      doc.addPage();
      pageBottom = PAGE_HEIGHT;
      y = drawTableHeader(doc, TOP_PADDING);
    }
    drawRow(doc, row, y);
    y += row.height;
  }
  const empty: Row = { cells: [], height: MIN_ROW_HEIGHT };
  while (y + MIN_ROW_HEIGHT <= totalsTop()) {
    drawRow(doc, empty, y);
    y += MIN_ROW_HEIGHT;
  }
  // Pegado a la última fila, sin hueco: lo que sobre (menos de una fila)
  // queda como margen de abajo.
  drawTotals(doc, remission, y);
}

function drawCutLine(doc: PDFKit.PDFDocument): void {
  doc
    .lineWidth(0.6)
    .strokeColor(MUTED)
    .dash(4, { space: 4 })
    .moveTo(12, HALF_HEIGHT)
    .lineTo(PAGE_WIDTH - 12, HALF_HEIGHT)
    .stroke()
    .undash();
}

// Sin estado de pago ni abonos a propósito: es dato interno del negocio,
// nunca algo que vea el cliente en el documento que se lleva.
export function renderRemissionPdf(
  remission: RemissionForPdf,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica').fontSize(VALUE_SIZE);
    const rows: Row[] = remission.items.map((item) => {
      const { product, unitPrice } = item.orderItem;
      const name = `${product.sku} — ${product.name}`;
      const lineTotal =
        Number(item.quantity.toString()) * Number(unitPrice.toString());
      return {
        cells: [
          name,
          product.material ?? '',
          product.finish ?? '',
          product.unit.name,
          formatQuantity(item.quantity),
          formatMoney(unitPrice),
          formatMoney(lineTotal),
        ],
        height: Math.max(
          MIN_ROW_HEIGHT,
          doc.heightOfString(name, {
            width: COLUMNS[0].width - CELL_PADDING * 2,
          }) +
            CELL_PADDING * 2,
        ),
      };
    });

    const fixedHeight =
      TOP_PADDING +
      HEADER_HEIGHT +
      GAP +
      INFO_ROW_HEIGHT * 5 +
      GAP +
      TABLE_HEADER_HEIGHT +
      TOTALS_HEIGHT +
      BOTTOM_PADDING;
    const rowsHeight = rows.reduce((total, row) => total + row.height, 0);

    if (fixedHeight + rowsHeight <= HALF_HEIGHT) {
      drawCopy(doc, remission, rows, COPIES[0], 0, HALF_HEIGHT);
      drawCutLine(doc);
      drawCopy(doc, remission, rows, COPIES[1], HALF_HEIGHT, PAGE_HEIGHT);
    } else {
      drawCopy(doc, remission, rows, COPIES[0], 0, PAGE_HEIGHT);
      doc.addPage();
      drawCopy(doc, remission, rows, COPIES[1], 0, PAGE_HEIGHT);
    }

    doc.end();
  });
}
