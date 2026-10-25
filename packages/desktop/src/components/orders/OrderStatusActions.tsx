import { Ban, Factory, PackageCheck } from 'lucide-react';
import { FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useCancelOrder } from '../../hooks/useCancelOrder';
import { useMarkOrderProduction } from '../../hooks/useMarkOrderProduction';
import { useMarkOrderWarehoused } from '../../hooks/useMarkOrderWarehoused';
import { currentStationSince } from '../../lib/order-status';
import { formatDuration } from '../../lib/format';
import type { Order } from '../../types/order';

interface OrderStatusActionsProps {
  order: Order;
  // En la fila del listado solo cabe el botón; el detalle muestra además
  // el tiempo en la estación y el error con su explicación completa.
  compact?: boolean;
}

// Vive en su propia fila/bloque (no en la página) porque cada acción
// necesita su propio estado de mutación/error — mismo motivo que
// CompleteOrderAction.tsx. Se usa tanto en la fila de OrdersPage como en el
// detalle de OrderDetailPage, así que el estado decide qué mostrar en un
// solo lugar. EN_ALMACEN -> DESPACHADO no es un botón: lo hace la remisión
// que completa el pedido.
export function OrderStatusActions({
  order,
  compact = false,
}: OrderStatusActionsProps) {
  const markProduction = useMarkOrderProduction();
  const markWarehoused = useMarkOrderWarehoused();
  const cancelOrder = useCancelOrder();

  // "Cancelar" se oculta si hay alguna remisión activa (#97) — una
  // remisión anulada (#99) ya corrigió el stock, así que no cuenta. El
  // backend ya rechaza esto con 400, esto solo evita el viaje redondo para
  // un caso que nunca debería intentarse desde la UI (mismo criterio que
  // UserRowActions ocultando "Desactivar" para la propia cuenta).
  const canCancel =
    order.status !== 'CANCELADO' &&
    order.status !== 'DESPACHADO' &&
    order.remissions.every((remission) => remission.voidedAt);

  const error =
    markProduction.error ?? markWarehoused.error ?? cancelOrder.error;

  return (
    <div
      className={`flex flex-col gap-2 ${compact ? 'items-end' : 'items-stretch'}`}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!compact && order.status === 'EN_PRODUCCION' && (
          <span className="text-ink-muted mr-1 text-xs">
            {formatDuration(currentStationSince(order), new Date())} en
            producción
          </span>
        )}
        {canCancel && !compact && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelOrder.mutate(order.id)}
            disabled={cancelOrder.isPending}
          >
            <Ban />
            {cancelOrder.isPending ? 'Cancelando…' : 'Cancelar pedido'}
          </Button>
        )}
        {order.status === 'PENDIENTE' && (
          <Button
            variant={compact ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => markProduction.mutate(order.id)}
            disabled={markProduction.isPending}
          >
            <Factory />
            {markProduction.isPending ? 'Marcando…' : 'Marcar en producción'}
          </Button>
        )}
        {order.status === 'EN_PRODUCCION' && (
          <Button
            variant={compact ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => markWarehoused.mutate(order.id)}
            disabled={markWarehoused.isPending}
          >
            <PackageCheck />
            {markWarehoused.isPending
              ? 'Marcando…'
              : 'Marcar enviado a almacén'}
          </Button>
        )}
      </div>
      {error && (
        <div className={compact ? 'max-w-64' : ''}>
          <FormError
            error={error}
            fallback="No se pudo cambiar el estado del pedido."
          />
        </div>
      )}
    </div>
  );
}
