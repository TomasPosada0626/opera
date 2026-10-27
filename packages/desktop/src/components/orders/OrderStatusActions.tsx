import { Ban, Factory } from 'lucide-react';
import { Link } from 'react-router';
import { FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useCancelOrder } from '../../hooks/useCancelOrder';
import { useMarkOrderProduction } from '../../hooks/useMarkOrderProduction';
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
// solo lugar. Ni EN_PRODUCCION -> EN_ALMACEN ni EN_ALMACEN -> DESPACHADO son
// botones: lo primero pasa solo al completar su producción en la pestaña
// Producción (ADR 0012), lo segundo con la remisión que completa el pedido.
export function OrderStatusActions({
  order,
  compact = false,
}: OrderStatusActionsProps) {
  const markProduction = useMarkOrderProduction();
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

  const error = markProduction.error ?? cancelOrder.error;

  const productionOrders = (order.productionOrders ?? []).filter(
    (production) => production.status !== 'CANCELADA',
  );
  const productionDone = productionOrders.filter(
    (production) => production.status === 'COMPLETADA',
  ).length;

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
            aria-label={compact ? 'Enviar a producción' : undefined}
            title={compact ? 'Enviar a producción' : undefined}
          >
            <Factory />
            {markProduction.isPending
              ? 'Enviando…'
              : compact
                ? 'A producción'
                : 'Enviar a producción'}
          </Button>
        )}
        {order.status === 'EN_PRODUCCION' && (
          <Link
            to="/produccion"
            className="text-accent hover:bg-chrome-strong focus-visible:ring-accent inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2"
            title="Se completa en la pestaña Producción"
          >
            <Factory className="h-4 w-4" />
            {productionOrders.length > 0
              ? `Producción ${productionDone}/${productionOrders.length}`
              : 'Ver en Producción'}
          </Link>
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
