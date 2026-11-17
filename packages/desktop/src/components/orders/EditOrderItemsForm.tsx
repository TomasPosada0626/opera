import { useState, type FormEvent } from 'react';
import { Factory, Plus, Save, X } from 'lucide-react';
import { ProductPicker } from '../inventory/ProductPicker';
import { FieldError, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useUpdateOrderItems } from '../../hooks/useUpdateOrderItems';
import { formatMoney, formatQuantity } from '../../lib/format';
import { deliveredFor, orderTotal } from '../../lib/order-status';
import type { Order, OrderItemProduct } from '../../types/order';
import type { Product } from '../../types/product';

interface LineDraft {
  key: string;
  // Línea que ya existe en el pedido; sin id es una agregada acá.
  id?: string;
  // El producto de una línea existente no cambia (se quita y se agrega
  // otra); el de una nueva se elige con el ProductPicker.
  fixedProduct?: OrderItemProduct;
  pickedProduct: Product | null;
  quantity: string;
  unitPrice: string;
  originalQuantity?: number;
  // Despachado en remisiones vigentes: la cantidad no baja de ahí, y con
  // algo despachado el precio queda fijo (cada remisión guardó su total).
  delivered: number;
  // Alguna remisión (aun anulada) apunta a la línea: no se puede quitar.
  hasRemissions: boolean;
}

function linesFrom(order: Order): LineDraft[] {
  return order.items.map((item) => ({
    key: item.id,
    id: item.id,
    fixedProduct: item.product,
    pickedProduct: null,
    quantity: String(Number(item.quantity)),
    unitPrice: String(Number(item.unitPrice)),
    originalQuantity: Number(item.quantity),
    delivered: deliveredFor(order, item.id),
    hasRemissions: order.remissions.some((remission) =>
      remission.items.some((line) => line.orderItemId === item.id),
    ),
  }));
}

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    pickedProduct: null,
    quantity: '',
    unitPrice: '',
    delivered: 0,
    hasRemissions: false,
  };
}

interface EditOrderItemsFormProps {
  order: Order;
  onSuccess: () => void;
}

// Corregir o ampliar un pedido ya montado (ADR 0013): el cliente llama a
// pedir extras y se ajusta este pedido, sin anular remisiones ni montar
// otro. Se manda la lista completa; el backend decide qué cambió y lo
// lleva a Producción.
export function EditOrderItemsForm({
  order,
  onSuccess,
}: EditOrderItemsFormProps) {
  const [lines, setLines] = useState<LineDraft[]>(() => linesFrom(order));
  const [linesError, setLinesError] = useState<string | null>(null);
  const updateItems = useUpdateOrderItems();

  const vatRate = Number(order.vatRate);
  const subtotal = lines.reduce(
    (sum, line) =>
      sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0,
  );
  const vat = Math.round(subtotal * vatRate) / 100;
  const previousTotal = orderTotal(order);
  const productionStarted = order.status !== 'PENDIENTE';

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (lines.length === 0) {
      setLinesError('El pedido debe tener al menos un producto');
      return;
    }
    const items = [];
    for (const line of lines) {
      const product = line.fixedProduct ?? line.pickedProduct;
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!product || !(quantity > 0) || !(unitPrice > 0)) {
        setLinesError(
          'Completa producto, cantidad y precio (mayores a 0) en cada línea',
        );
        return;
      }
      if (quantity < line.delivered) {
        setLinesError(
          `${product.name}: ya se despacharon ${formatQuantity(line.delivered)}, la cantidad no puede quedar en menos`,
        );
        return;
      }
      items.push({ id: line.id, productId: product.id, quantity, unitPrice });
    }
    setLinesError(null);
    updateItems.mutate({ orderId: order.id, items }, { onSuccess });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {productionStarted && (
        <div className="border-accent-line bg-accent-surface text-ink-secondary flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]">
          <Factory className="text-accent mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Lo que agregues se manda a Producción y lo que quites se descuenta
            de lo pendiente por producir; lo ya producido queda en inventario.
            {order.status !== 'EN_PRODUCCION' &&
              ' Si agregas, el pedido vuelve a producción hasta completar lo nuevo.'}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {lines.map((line, index) => {
          const quantity = Number(line.quantity) || 0;
          const change =
            line.originalQuantity !== undefined
              ? quantity - line.originalQuantity
              : 0;
          const canRemove = !line.hasRemissions && lines.length > 1;
          return (
            <div
              key={line.key}
              className="border-line bg-chrome/50 flex flex-col gap-2 rounded-xl border p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {line.fixedProduct ? (
                    <div className="flex h-9 flex-col justify-center">
                      <p className="text-ink truncate text-sm font-medium">
                        {line.fixedProduct.name}
                      </p>
                      <p className="code text-ink-faint text-xs">
                        {line.fixedProduct.sku}
                      </p>
                    </div>
                  ) : (
                    <ProductPicker
                      value={line.pickedProduct}
                      onChange={(pickedProduct) =>
                        updateLine(line.key, { pickedProduct })
                      }
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.key !== line.key))
                  }
                  disabled={!canRemove}
                  aria-label={`Quitar línea ${index + 1}`}
                  title={
                    line.hasRemissions
                      ? 'Ya tiene remisiones: deja su cantidad en lo despachado.'
                      : undefined
                  }
                  className="text-ink-muted hover:text-danger hover:bg-danger-surface focus-visible:ring-accent shrink-0 rounded-lg p-2 transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <input
                  type="number"
                  step="any"
                  min={line.delivered}
                  placeholder="Cantidad"
                  aria-label={`Cantidad línea ${index + 1}`}
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(line.key, { quantity: event.target.value })
                  }
                  className="field h-9 px-3"
                />
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Precio unitario"
                  aria-label={`Precio unitario línea ${index + 1}`}
                  value={line.unitPrice}
                  disabled={line.delivered > 0}
                  title={
                    line.delivered > 0
                      ? 'Ya tiene despachos: el precio quedó fijo en sus remisiones.'
                      : undefined
                  }
                  onChange={(event) =>
                    updateLine(line.key, { unitPrice: event.target.value })
                  }
                  className="field h-9 px-3 disabled:opacity-60"
                />
                <span className="figures text-ink-muted w-28 text-right text-[13px]">
                  {formatMoney(quantity * (Number(line.unitPrice) || 0))}
                </span>
              </div>
              {(line.delivered > 0 || change !== 0 || !line.id) && (
                <div className="flex flex-wrap gap-x-3 text-xs">
                  {!line.id && <span className="text-accent">Nuevo</span>}
                  {change > 0 && (
                    <span className="figures text-accent">
                      +{formatQuantity(change)} extra
                    </span>
                  )}
                  {change < 0 && (
                    <span className="figures text-warning">
                      {formatQuantity(change)} menos
                    </span>
                  )}
                  {line.delivered > 0 && (
                    <span className="figures text-ink-faint">
                      Despachado {formatQuantity(line.delivered)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
          className="self-start"
        >
          <Plus />
          Agregar producto
        </Button>
        <FieldError message={linesError ?? undefined} />
      </div>

      <div className="border-line flex flex-col gap-1 border-t pt-4 text-[13px]">
        {vatRate > 0 && (
          <>
            <div className="text-ink-muted flex justify-between">
              <span>Subtotal</span>
              <span className="figures">{formatMoney(subtotal)}</span>
            </div>
            <div className="text-ink-muted flex justify-between">
              <span>IVA {vatRate} %</span>
              <span className="figures">{formatMoney(vat)}</span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-ink font-medium">Total del pedido</span>
          <span className="figures text-ink text-base font-semibold">
            {formatMoney(subtotal + vat)}
          </span>
        </div>
        <p className="text-ink-faint text-right text-xs">
          Antes: <span className="figures">{formatMoney(previousTotal)}</span>
        </p>
      </div>

      <FormError
        error={updateItems.error}
        fallback="No se pudieron guardar los cambios. Intenta de nuevo."
      />

      <Button type="submit" disabled={updateItems.isPending}>
        <Save />
        {updateItems.isPending ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </form>
  );
}
