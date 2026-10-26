import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PackagePlus, Plus, X } from 'lucide-react';
import { z } from 'zod';
import { ProductPicker } from '../inventory/ProductPicker';
import { WarehouseSelect } from '../form/WarehouseSelect';
import { FieldError, FieldLabel, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { PaymentFields } from '../orders/PaymentFields';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useSupplierProducts } from '../../hooks/useSupplierProducts';
import { useCreatePurchaseOrder } from '../../hooks/usePurchaseOrderMutations';
import { formatMoney, toDateInputValue } from '../../lib/format';
import { toPaymentInput, type PaymentDraft } from '../../lib/payment-draft';
import type { Product } from '../../types/product';
import type { PurchaseOrder } from '../../types/purchase-order';

const purchaseSchema = z.object({
  supplierId: z.string().min(1, 'Selecciona un proveedor'),
  warehouseId: z.string().min(1, 'Selecciona una bodega'),
  expectedDate: z.string().optional(),
  supplierInvoice: z.string().max(100, 'Máximo 100 caracteres').optional(),
  notes: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
});
type PurchaseFormValues = z.infer<typeof purchaseSchema>;

interface LineDraft {
  key: string;
  product: Product | null;
  quantity: string;
  unitCost: string;
}

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    product: null,
    quantity: '',
    unitCost: '',
  };
}

interface PurchaseOrderFormProps {
  // Desde la ficha del proveedor: ya viene elegido y no se cambia.
  supplierId?: string;
  onSuccess: (order: PurchaseOrder) => void;
}

// Mismo patrón que OrderForm: las líneas viven en estado local porque
// ProductPicker es un control externo, no un input registrable. Si el
// proveedor tiene precio cargado para un producto, el costo se llena solo.
export function PurchaseOrderForm({
  supplierId: fixedSupplierId,
  onSuccess,
}: PurchaseOrderFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplierId: fixedSupplierId ?? '',
      expectedDate: '',
      supplierInvoice: '',
      notes: '',
    },
  });
  const supplierId = useWatch({ control, name: 'supplierId' });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [withAdvance, setWithAdvance] = useState(false);
  const [advance, setAdvance] = useState<PaymentDraft>({
    amount: '',
    method: 'TRANSFERENCIA',
    paidOn: toDateInputValue(new Date()),
    note: '',
  });
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const activeSuppliers = (suppliersQuery.data?.data ?? []).filter(
    (supplier) => supplier.isActive,
  );
  const pricesQuery = useSupplierProducts({ supplierId, pageSize: 100 });
  const priceByProduct = useMemo(
    () =>
      new Map(
        (pricesQuery.data?.data ?? []).map((entry) => [
          entry.product.id,
          entry.price,
        ]),
      ),
    [pricesQuery.data],
  );

  const createPurchase = useCreatePurchaseOrder();

  const total = lines.reduce(
    (sum, line) =>
      sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0,
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function pickProduct(key: string, product: Product | null) {
    const price = product ? priceByProduct.get(product.id) : undefined;
    const line = lines.find((l) => l.key === key);
    updateLine(key, {
      product,
      // Solo si el costo está vacío: no pisar lo que ya se escribió.
      ...(price !== undefined && line && !line.unitCost
        ? { unitCost: String(Number(price)) }
        : {}),
    });
  }

  function onSubmit(values: PurchaseFormValues) {
    if (lines.length === 0) {
      setLinesError('Agrega al menos un producto');
      return;
    }
    const items = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      if (
        !line.product ||
        !quantity ||
        quantity <= 0 ||
        line.unitCost === '' ||
        unitCost < 0
      ) {
        setLinesError(
          'Completa producto, cantidad (mayor a 0) y costo en cada línea',
        );
        return;
      }
      items.push({ productId: line.product.id, quantity, unitCost });
    }
    const productIds = items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      setLinesError('Hay un producto repetido: súmalo en una sola línea');
      return;
    }
    setLinesError(null);

    let initialPayment;
    if (withAdvance) {
      const parsed = toPaymentInput(advance, total);
      if (!parsed.ok) {
        setAdvanceError(parsed.error);
        return;
      }
      initialPayment = parsed.value;
    }
    setAdvanceError(null);

    createPurchase.mutate(
      {
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        items,
        expectedDate: values.expectedDate || undefined,
        supplierInvoice: values.supplierInvoice?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
        initialPayment,
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
        {!fixedSupplierId && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <FieldLabel htmlFor="purchaseSupplier">Proveedor</FieldLabel>
            <select
              id="purchaseSupplier"
              aria-invalid={!!errors.supplierId}
              className="field h-9 px-3"
              {...register('supplierId')}
            >
              <option value="">Selecciona…</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.supplierId?.message} />
          </div>
        )}

        <WarehouseSelect
          registration={register('warehouseId')}
          error={errors.warehouseId}
          onAutoSelect={(id) => setValue('warehouseId', id)}
        />

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="purchaseExpectedDate" hint="opcional">
            Fecha esperada
          </FieldLabel>
          <input
            id="purchaseExpectedDate"
            type="date"
            className="field h-9 px-3"
            {...register('expectedDate')}
          />
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <FieldLabel htmlFor="purchaseInvoice" hint="opcional">
            Factura del proveedor
          </FieldLabel>
          <input
            id="purchaseInvoice"
            type="text"
            placeholder="N.º de la factura, para cruzarla con su cobro"
            className="field h-9 px-3"
            {...register('supplierInvoice')}
          />
          <FieldError message={errors.supplierInvoice?.message} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-secondary text-[13px] font-medium">
            Productos
          </span>
          <span className="text-ink-muted text-xs">
            Total{' '}
            <span className="figures text-ink text-sm font-semibold">
              {formatMoney(total)}
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
                  onChange={(product) => pickProduct(line.key, product)}
                  ariaLabel={`Producto línea ${index + 1}`}
                />
              </div>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.key !== line.key))
                  }
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
                className="field figures h-9 px-3"
              />
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Costo unitario"
                aria-label={`Costo unitario línea ${index + 1}`}
                value={line.unitCost}
                onChange={(event) =>
                  updateLine(line.key, { unitCost: event.target.value })
                }
                className="field figures h-9 px-3"
              />
              <span className="figures text-ink-muted w-28 text-right text-[13px]">
                {formatMoney(
                  (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
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
        <FieldLabel htmlFor="purchaseNotes" hint="opcional">
          Notas
        </FieldLabel>
        <textarea
          id="purchaseNotes"
          rows={2}
          placeholder="Condiciones, plazo de pago, quién la pidió…"
          className="field px-3 py-2"
          {...register('notes')}
        />
        <FieldError message={errors.notes?.message} />
      </div>

      <div className="border-line flex flex-col gap-3 rounded-xl border p-4">
        <label className="text-ink-secondary flex items-center gap-2.5 text-[13px] font-medium">
          <input
            type="checkbox"
            checked={withAdvance}
            onChange={(event) => setWithAdvance(event.target.checked)}
            className="accent-accent h-4 w-4"
          />
          Registrar un anticipo al proveedor
        </label>
        {withAdvance && (
          <>
            <PaymentFields
              idPrefix="purchase-advance"
              value={advance}
              onChange={setAdvance}
              max={total}
            />
            <FieldError message={advanceError ?? undefined} />
          </>
        )}
      </div>

      <FormError
        error={createPurchase.error}
        fallback="No se pudo registrar la compra. Intenta de nuevo."
      />

      <Button type="submit" disabled={createPurchase.isPending}>
        <PackagePlus />
        {createPurchase.isPending ? 'Registrando…' : 'Registrar compra'}
      </Button>
    </form>
  );
}
