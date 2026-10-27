import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Ban, Check, X } from 'lucide-react';
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
// equivocada. Completar pide cuánto salió bueno (puede haber dañados): eso
// es lo que entra al inventario (ADR 0012). Las órdenes de un pedido no se
// cancelan acá sino cancelando el pedido.
export function CompleteOrderAction({ order }: CompleteOrderActionProps) {
  const completeOrder = useCompleteProductionOrder();
  const cancelOrder = useCancelProductionOrder();
  const [isAsking, setIsAsking] = useState(false);
  const [produced, setProduced] = useState(String(Number(order.quantity)));
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Al abrir el campo, el cursor queda ahí para escribir la cantidad.
  useEffect(() => {
    if (isAsking) {
      inputRef.current?.select();
    }
  }, [isAsking]);

  if (order.status !== 'PENDIENTE') {
    return <span className="text-ink-faint">—</span>;
  }

  function handleComplete(event: FormEvent) {
    event.preventDefault();
    const value = Number(produced);
    if (produced.trim() === '' || !Number.isFinite(value) || value < 0) {
      setInputError('Escribe cuántas salieron buenas (0 o más).');
      return;
    }
    setInputError(null);
    completeOrder.mutate({ orderId: order.id, producedQuantity: value });
  }

  const busy = completeOrder.isPending || cancelOrder.isPending;

  return (
    <div className="flex flex-col items-end gap-1">
      {isAsking ? (
        <form
          onSubmit={handleComplete}
          className="flex items-center justify-end gap-2"
        >
          <label
            htmlFor={`produced-${order.id}`}
            className="text-ink-muted text-xs whitespace-nowrap"
          >
            Salieron buenas
          </label>
          <input
            id={`produced-${order.id}`}
            type="number"
            min="0"
            step="any"
            ref={inputRef}
            value={produced}
            onChange={(event) => setProduced(event.target.value)}
            className="field figures h-8 w-24 px-2 text-right"
          />
          <Button type="submit" size="sm" disabled={busy}>
            <Check className="h-4 w-4" />
            {completeOrder.isPending ? 'Completando…' : 'Completar'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsAsking(false)}
            disabled={busy}
            aria-label="No completar todavía"
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setIsAsking(true)}
            disabled={busy}
            size="sm"
          >
            <Check className="h-4 w-4" />
            Completar
          </Button>
          {!order.order && (
            <Button
              variant="ghost"
              onClick={() => cancelOrder.mutate(order.id)}
              disabled={busy}
              size="sm"
            >
              <Ban className="h-4 w-4" />
              {cancelOrder.isPending ? 'Cancelando…' : 'Cancelar'}
            </Button>
          )}
        </div>
      )}
      {inputError && (
        <p className="text-danger max-w-56 text-right text-xs">{inputError}</p>
      )}
      {completeOrder.isError && (
        <p className="text-danger max-w-56 text-right text-xs">
          {completeOrder.error instanceof ApiError
            ? completeOrder.error.message
            : 'No se pudo completar la orden.'}
        </p>
      )}
      {cancelOrder.isError && (
        <p className="text-danger max-w-56 text-right text-xs">
          {cancelOrder.error instanceof ApiError
            ? cancelOrder.error.message
            : 'No se pudo cancelar la orden.'}
        </p>
      )}
    </div>
  );
}
