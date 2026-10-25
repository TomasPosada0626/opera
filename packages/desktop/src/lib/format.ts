// Un solo lugar para mostrar números, plata y fechas — antes cada página
// tenía su propio formatDate()/toLocaleString() con pequeñas diferencias
// (unas con dos decimales, otras sin símbolo, otras en formato corto).

// Pesos enteros sin decimales ($ 1.250.000); con centavos, siempre dos
// ($ 150,50, nunca $ 150,5).
const moneyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyWithCentsFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactMoneyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const quantityFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 3,
});

// Los Decimal de Prisma llegan como string en el JSON; se aceptan ambos.
type NumericInput = string | number | null | undefined;

function toNumber(value: NumericInput): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoney(value: NumericInput): string {
  const amount = toNumber(value);
  return Number.isInteger(amount)
    ? moneyFormatter.format(amount)
    : moneyWithCentsFormatter.format(amount);
}

// "$ 1,2 M" — para KPIs, donde el número completo no cabe ni se lee de un
// vistazo. El valor exacto va en el title/tooltip del mismo elemento.
export function formatMoneyCompact(value: NumericInput): string {
  return compactMoneyFormatter.format(toNumber(value));
}

export function formatQuantity(value: NumericInput): string {
  return quantityFormatter.format(toNumber(value));
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Fechas sin hora (Order.estimatedDeliveryDate es DATE): el backend las
// manda como medianoche UTC ("2026-11-15T00:00:00.000Z"). Pasarlas por
// new Date() + toLocaleDateString las corre al día anterior en Colombia
// (UTC-5), así que se leen solo los primeros 10 caracteres.
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateOnly(value: string): string {
  return parseDateOnly(value).toLocaleDateString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// "AAAA-MM-DD" de una fecha local, para <input type="date"> y la API.
export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const MS_PER_DAY = 86_400_000;

// Días calendario completos entre dos instantes (no redondea a favor: 23 h
// todavía son 0 días).
export function wholeDaysBetween(from: string | Date, to: Date): number {
  return Math.max(
    0,
    Math.floor((to.getTime() - new Date(from).getTime()) / MS_PER_DAY),
  );
}

// "hoy", "1 día", "12 días" — duración legible para el tiempo en una
// estación del pedido. Menos de un día se muestra en horas para que un
// pedido recién movido no diga "0 días".
export function formatDuration(from: string | Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - new Date(from).getTime());
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) {
    return 'menos de 1 h';
  }
  if (hours < 24) {
    return `${hours} h`;
  }
  const days = Math.floor(ms / MS_PER_DAY);
  return days === 1 ? '1 día' : `${days} días`;
}
