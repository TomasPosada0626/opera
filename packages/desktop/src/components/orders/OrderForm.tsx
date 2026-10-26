import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ShoppingCart, X } from 'lucide-react';
import { z } from 'zod';
import { CustomerPicker } from '../customers/CustomerPicker';
import { ProductPicker } from '../inventory/ProductPicker';
import { WarehouseSelect } from '../form/WarehouseSelect';
import { FieldError, FieldLabel, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useCreateOrder } from '../../hooks/useCreateOrder';
import { formatMoney, toDateInputValue } from '../../lib/format';
import type { Customer } from '../../types/customer';
import type { Product } from '../../types/product';

const orderSchema = z.object({
  warehouseId: z.string().min(1, 'Selecciona una bodega'),
  // Obligatoria en el formulario (en la API es opcional para scripts y
  // pedidos viejos): sin fecha prometida no hay forma de saber si un
  // pedido va atrasado.
  estimatedDeliveryDate: z.string().min(1, 'Elige la fecha de envío'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
  // No todas las ventas llevan IVA: se elige por pedido.
  vatRate: z.enum(['19', '0']),
});
type OrderFormValues = z.infer<typeof orderSchema>;

interface OrderLineDraft {
  key: string;
  product: Product | null;
  quantity: string;
  unitPrice: string;
}

function emptyLine(): OrderLineDraft {
  return {
    key: crypto.randomUUID(),
    product: null,
    quantity: '',
    unitPrice: '',
  };
}

// Una semana después de hoy: el plazo típico de un pedido a fabricar, para
// que la mayoría de las veces solo haya que confirmarlo.
function defaultDeliveryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toDateInputValue(date);
}

interface OrderFormProps {
  onSuccess: () => void;
}

// Las líneas viven en estado local, no en react-hook-form — ProductPicker
// (#43) ya es un control externo con su propio estado/validación, no un
// input registrable; mismo motivo por el que ProductionOrderForm (#45)
// combina RHF (bodega/cantidad) con un ProductPicker suelto. Con varias
// líneas dinámicas, extender ese mismo patrón es más simple que forzar
// useFieldArray sobre un control que no lo necesita.
export function OrderForm({ onSuccess }: OrderFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      estimatedDeliveryDate: defaultDeliveryDate(),
      notes: '',
      vatRate: '19',
    },
  });
  const [lines, setLines] = useState<OrderLineDraft[]>([emptyLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const notes = useWatch({ control, name: 'notes' }) ?? '';
  const vatRate = Number(useWatch({ control, name: 'vatRate' }) ?? '19');

  const createOrder = useCreateOrder();

  const subtotal = lines.reduce(
    (sum, line) =>
      sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0,
  );
  const vat = Math.round(subtotal * vatRate) / 100;

  function updateLine(key: string, patch: Partial<OrderLineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function onSubmit(values: OrderFormValues) {
    if (!customer) {
      setCustomerError('Selecciona o crea un cliente');
      return;
    }
    setCustomerError(null);

    if (lines.length === 0) {
      setLinesError('Agrega al menos un producto');
      return;
    }
    const items = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (
        !line.product ||
        !quantity ||
        quantity <= 0 ||
        !unitPrice ||
        unitPrice <= 0
      ) {
        setLinesError(
          'Completa producto, cantidad y precio (mayores a 0) en cada línea',
        );
        return;
      }
      items.push({ productId: line.product.id, quantity, unitPrice });
    }
    setLinesError(null);

    createOrder.mutate(
      {
        customerId: customer.id,
        warehouseId: values.warehouseId,
        items,
        estimatedDeliveryDate: values.estimatedDeliveryDate,
        notes: values.notes?.trim() || undefined,
        vatRate: Number(values.vatRate),
      },
      { onSuccess },
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-ink-secondary text-[13px] font-medium">
            Cliente
          </span>
          <CustomerPicker value={customer} onChange={setCustomer} />
          <FieldError message={customerError ?? undefined} />
        </div>

        <WarehouseSelect
          registration={register('warehouseId')}
          error={errors.warehouseId}
          onAutoSelect={(id) => setValue('warehouseId', id)}
        />

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="estimatedDeliveryDate">
            Fecha de envío estimada
          </FieldLabel>
          <input
            id="estimatedDeliveryDate"
            type="date"
            aria-invalid={!!errors.estimatedDeliveryDate}
            className="field h-9 px-3"
            {...register('estimatedDeliveryDate')}
          />
          <FieldError message={errors.estimatedDeliveryDate?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="vatRate">IVA</FieldLabel>
          <select
            id="vatRate"
            className="field h-9 px-3"
            {...register('vatRate')}
          >
            <option value="19">Con IVA (19 %)</option>
            <option value="0">Sin IVA</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-secondary text-[13px] font-medium">
            Productos
          </span>
          <span className="text-ink-muted text-xs">
            {vatRate > 0 && (
              <>
                Subtotal{' '}
                <span className="figures text-ink-secondary">
                  {formatMoney(subtotal)}
                </span>
                {' · '}IVA{' '}
                <span className="figures text-ink-secondary">
                  {formatMoney(vat)}
                </span>
                {' · '}
              </>
            )}
            Total{' '}
            <span className="figures text-ink text-sm font-semibold">
              {formatMoney(subtotal + vat)}
            </span>
          </span>
        </div>
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="border-line bg-chrome/50 flex flex-col gap-2 rounded-xl border p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <ProductPicker
                  value={line.product}
                  onChange={(product) => updateLine(line.key, { product })}
                />
              </div>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Quitar línea ${index + 1}`}
                  className="text-ink-muted hover:text-danger hover:bg-danger-surface focus-visible:ring-accent shrink-0 rounded-lg p-2 transition-colors outline-none focus-visible:ring-2"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <input
                type="number"
                step="any"
                min="0"
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
                onChange={(event) =>
                  updateLine(line.key, { unitPrice: event.target.value })
                }
                className="field h-9 px-3"
              />
              <span className="figures text-ink-muted w-28 text-right text-[13px]">
                {formatMoney(
                  (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
                )}
              </span>
            </div>
          </div>
        ))}
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

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="orderNotes" hint={`${notes.length}/1000`}>
          Notas
        </FieldLabel>
        <textarea
          id="orderNotes"
          rows={2}
          placeholder="Acabado, medidas especiales, dirección de entrega…"
          className="field px-3 py-2"
          {...register('notes')}
        />
        <FieldError message={errors.notes?.message} />
      </div>

      <FormError
        error={createOrder.error}
        fallback="No se pudo crear el pedido. Intenta de nuevo."
      />

      <Button type="submit" disabled={createOrder.isPending}>
        <ShoppingCart />
        {createOrder.isPending ? 'Creando…' : 'Crear pedido'}
      </Button>
    </form>
  );
}
