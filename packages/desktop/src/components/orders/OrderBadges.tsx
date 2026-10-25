import { CalendarClock } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { formatDateOnly } from '../../lib/format';
import {
  deliveryState,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
} from '../../lib/order-status';
import type {
  Order,
  OrderStatus,
  RemissionPaymentStatus,
} from '../../types/order';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={ORDER_STATUS_VARIANT[status]} dot>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({
  status,
}: {
  status: RemissionPaymentStatus;
}) {
  return (
    <Badge variant={PAYMENT_STATUS_VARIANT[status]} dot>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

interface DeliveryDateProps {
  order: Pick<Order, 'estimatedDeliveryDate' | 'status'>;
  // "compact" para celdas de tabla: solo la fecha corta + el aviso.
  compact?: boolean;
}

// Fecha de envío prometida + qué tan cerca está: atrasado (rojo), vence
// hoy (ámbar), o cuántos días faltan. Para un pedido ya despachado o
// cancelado solo queda la fecha, sin alarma.
export function DeliveryDate({ order, compact = false }: DeliveryDateProps) {
  if (!order.estimatedDeliveryDate) {
    return <span className="text-ink-faint text-[13px]">Sin fecha</span>;
  }
  const state = deliveryState(order);
  const date = formatDateOnly(order.estimatedDeliveryDate);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 text-[13px] ${
          state.kind === 'overdue' ? 'text-danger font-medium' : 'text-ink'
        }`}
      >
        {!compact && <CalendarClock className="h-3.5 w-3.5 opacity-70" />}
        {date}
      </span>
      {state.kind === 'overdue' && (
        <Badge variant="danger">
          {state.days === 1 ? '1 día tarde' : `${state.days} días tarde`}
        </Badge>
      )}
      {state.kind === 'today' && <Badge variant="warning">Vence hoy</Badge>}
      {state.kind === 'upcoming' && !compact && (
        <span className="text-ink-muted text-xs">
          {state.days === 1 ? 'mañana' : `en ${state.days} días`}
        </span>
      )}
    </span>
  );
}
