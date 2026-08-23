import { Factory, PackageCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useMarkOrderProduction } from '../../hooks/useMarkOrderProduction';
import { useMarkOrderWarehoused } from '../../hooks/useMarkOrderWarehoused';
import { ApiError } from '../../lib/api-client';
import type { Order } from '../../types/order';

interface OrderStatusActionsProps {
  order: Order;
}

const MS_PER_DAY = 86_400_000;

// Contador de días derivado en el cliente a partir de productionStartedAt —
// no hay un campo de "días en producción" en el backend, se calcula igual
// que orderTotal() en OrdersPage.
function daysInProduction(productionStartedAt: string): number {
  return Math.floor(
    (Date.now() - new Date(productionStartedAt).getTime()) / MS_PER_DAY,
  );
}

// Vive en su propia fila/bloque (no en la página) porque cada acción
// necesita su propio estado de mutación/error — mismo motivo que
// CompleteOrderAction.tsx. Se usa tanto en la fila de OrdersPage como en el
// detalle de OrderDetailPage, así que el estado (PENDIENTE/EN_PRODUCCION/
// EN_ALMACEN/CANCELADO) decide qué mostrar en un solo lugar.
export function OrderStatusActions({ order }: OrderStatusActionsProps) {
  const markProduction = useMarkOrderProduction();
  const markWarehoused = useMarkOrderWarehoused();

  if (order.status === 'PENDIENTE') {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="secondary"
          onClick={() => markProduction.mutate(order.id)}
          disabled={markProduction.isPending}
          className="px-3 py-1.5"
        >
          <Factory className="h-4 w-4" />
          {markProduction.isPending ? 'Marcando…' : 'Marcar en producción'}
        </Button>
        {markProduction.isError && (
          <p className="text-danger max-w-48 text-right text-xs">
            {markProduction.error instanceof ApiError
              ? markProduction.error.message
              : 'No se pudo marcar en producción.'}
          </p>
        )}
      </div>
    );
  }

  if (order.status === 'EN_PRODUCCION') {
    const days = order.productionStartedAt
      ? daysInProduction(order.productionStartedAt)
      : 0;
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-ink-muted text-xs">
          {days === 1 ? '1 día en producción' : `${days} días en producción`}
        </p>
        <Button
          variant="secondary"
          onClick={() => markWarehoused.mutate(order.id)}
          disabled={markWarehoused.isPending}
          className="px-3 py-1.5"
        >
          <PackageCheck className="h-4 w-4" />
          {markWarehoused.isPending ? 'Marcando…' : 'Marcar enviado a almacén'}
        </Button>
        {markWarehoused.isError && (
          <p className="text-danger max-w-48 text-right text-xs">
            {markWarehoused.error instanceof ApiError
              ? markWarehoused.error.message
              : 'No se pudo marcar enviado a almacén.'}
          </p>
        )}
      </div>
    );
  }

  return <span className="text-ink-faint">—</span>;
}
