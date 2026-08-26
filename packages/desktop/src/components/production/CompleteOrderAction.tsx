import { Ban, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { useCancelProductionOrder } from '../../hooks/useCancelProductionOrder';
import { useCompleteProductionOrder } from '../../hooks/useCompleteProductionOrder';
import { ApiError } from '../../lib/api-client';
import type { ProductionOrder } from '../../types/production';

interface CompleteOrderActionProps {
  order: ProductionOrder;
}

// Vive en su propia fila (no en la página) porque cada botón necesita su
// propio estado de mutación/error — una sola mutación compartida entre
// todas las filas mostraría el spinner o el error equivocado en la fila
// equivocada.
export function CompleteOrderAction({ order }: CompleteOrderActionProps) {
  const completeOrder = useCompleteProductionOrder();
  const cancelOrder = useCancelProductionOrder();

  if (order.status !== 'PENDIENTE') {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => completeOrder.mutate(order.id)}
          disabled={completeOrder.isPending || cancelOrder.isPending}
          className="px-3 py-1.5"
        >
          <Check className="h-4 w-4" />
          {completeOrder.isPending ? 'Completando…' : 'Completar'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => cancelOrder.mutate(order.id)}
          disabled={completeOrder.isPending || cancelOrder.isPending}
          className="px-3 py-1.5"
        >
          <Ban className="h-4 w-4" />
          {cancelOrder.isPending ? 'Cancelando…' : 'Cancelar'}
        </Button>
      </div>
      {completeOrder.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {completeOrder.error instanceof ApiError
            ? completeOrder.error.message
            : 'No se pudo completar la orden.'}
        </p>
      )}
      {cancelOrder.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {cancelOrder.error instanceof ApiError
            ? cancelOrder.error.message
            : 'No se pudo cancelar la orden.'}
        </p>
      )}
    </div>
  );
}
