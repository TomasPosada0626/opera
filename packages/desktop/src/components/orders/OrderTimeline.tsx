import { Check, Ban } from 'lucide-react';
import { formatDateTime, formatDuration } from '../../lib/format';
import { orderStations } from '../../lib/order-status';
import type { Order } from '../../types/order';

interface OrderTimelineProps {
  order: Order;
  now?: Date;
}

// Las cuatro estaciones del pedido en horizontal: cuándo entró a cada una
// y cuánto tiempo estuvo (o lleva) ahí. Es la respuesta a "¿en qué va este
// pedido y dónde se está demorando?" sin abrir el Kardex ni el historial.
export function OrderTimeline({ order, now = new Date() }: OrderTimelineProps) {
  const stations = orderStations(order);
  const isCancelled = order.status === 'CANCELADO';
  const currentIndex = stations.findIndex(
    (station) => station.status === order.status,
  );

  return (
    <ol className="grid grid-cols-4 gap-0" aria-label="Estaciones del pedido">
      {stations.map((station, index) => {
        const reached = station.enteredAt !== null;
        const isCurrent = !isCancelled && index === currentIndex;
        const isDone = reached && !isCurrent;
        const connectorDone =
          index < stations.length - 1 && stations[index + 1].enteredAt !== null;

        return (
          <li
            key={station.status}
            className="relative flex flex-col gap-3 pr-4"
          >
            <div className="flex items-center">
              <span
                aria-hidden="true"
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
                  isCurrent
                    ? 'border-accent bg-accent text-on-accent animate-soft-pulse'
                    : isDone
                      ? 'border-success-line bg-success-surface text-success'
                      : 'border-line-strong bg-surface-raised text-ink-faint'
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {index < stations.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-2 h-px flex-1 ${
                    connectorDone ? 'bg-success/50' : 'bg-line-strong'
                  }`}
                />
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <span
                className={`text-[13px] font-medium ${
                  reached ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                {station.label}
                {isCurrent && <span className="sr-only"> (estado actual)</span>}
              </span>
              {station.enteredAt ? (
                <>
                  <span className="text-ink-muted text-xs">
                    {formatDateTime(station.enteredAt)}
                  </span>
                  {station.status !== 'DESPACHADO' && (
                    <span
                      className={`figures text-xs ${
                        isCurrent ? 'text-accent font-medium' : 'text-ink-faint'
                      }`}
                    >
                      {isCurrent
                        ? `Lleva ${formatDuration(station.enteredAt, now)}`
                        : station.leftAt
                          ? `Estuvo ${formatDuration(station.enteredAt, new Date(station.leftAt))}`
                          : ''}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-ink-faint text-xs">—</span>
              )}
            </div>
          </li>
        );
      })}
      {isCancelled && order.cancelledAt && (
        <li className="text-danger col-span-4 mt-2 flex items-center gap-2 text-[13px]">
          <Ban className="h-4 w-4" />
          Cancelado el {formatDateTime(order.cancelledAt)}
        </li>
      )}
    </ol>
  );
}
