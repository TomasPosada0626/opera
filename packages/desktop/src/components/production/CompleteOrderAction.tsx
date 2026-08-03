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

  if (order.status !== 'PENDIENTE') {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => completeOrder.mutate(order.id)}
        disabled={completeOrder.isPending}
        className="border-line text-ink hover:bg-surface-raised rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {completeOrder.isPending ? 'Completando…' : 'Completar'}
      </button>
      {completeOrder.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {completeOrder.error instanceof ApiError
            ? completeOrder.error.message
            : 'No se pudo completar la orden.'}
        </p>
      )}
    </div>
  );
}
