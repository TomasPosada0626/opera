import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProductPicker } from './ProductPicker';
import { useCreateMovement } from '../../hooks/useCreateMovement';
import { useWarehouses } from '../../hooks/useWarehouses';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

const movementSchema = z
  .object({
    type: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
    warehouseId: z.string().min(1, 'Selecciona una bodega'),
    quantity: z.number({ message: 'Ingresa una cantidad' }),
    unitCost: z.number().positive('Debe ser mayor a 0').optional(),
    reason: z.string().optional(),
  })
  // Reglas cruzadas entre campos (#43, mismas del backend): AJUSTE nunca 0 y
  // siempre con motivo; ENTRADA/SALIDA siempre positivas — el signo de
  // SALIDA lo aplica el backend, no el formulario.
  .superRefine((data, ctx) => {
    if (data.type === 'AJUSTE') {
      if (data.quantity === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'No puede ser 0',
        });
      }
      if (!data.reason?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['reason'],
          message: 'El motivo es obligatorio para un ajuste',
        });
      }
    } else if (!(data.quantity > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Debe ser mayor a 0',
      });
    }
  });

type MovementFormValues = z.infer<typeof movementSchema>;

interface MovementFormProps {
  onSuccess: () => void;
}

export function MovementForm({ onSuccess }: MovementFormProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productError, setProductError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: 'ENTRADA' },
  });
  const type = watch('type');

  const warehousesQuery = useWarehouses();
  const createMovement = useCreateMovement();

  function onSubmit(values: MovementFormValues) {
    if (!selectedProduct) {
      setProductError('Selecciona un producto');
      return;
    }

    createMovement.mutate(
      {
        type: values.type,
        productId: selectedProduct.id,
        warehouseId: values.warehouseId,
        quantity: values.quantity,
        reason: values.reason?.trim() || undefined,
        unitCost: values.type === 'ENTRADA' ? values.unitCost : undefined,
      },
      { onSuccess },
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-ink-muted text-sm font-medium">
          Tipo de movimiento
        </label>
        <select
          id="type"
          {...register('type')}
          className="border-line bg-surface text-ink focus:border-accent rounded-md border px-3 py-2 text-sm outline-none"
        >
          <option value="ENTRADA">Entrada</option>
          <option value="SALIDA">Salida</option>
          <option value="AJUSTE">Ajuste</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-ink-muted text-sm font-medium">Producto</span>
        <ProductPicker
          value={selectedProduct}
          onChange={(product) => {
            setSelectedProduct(product);
            if (product) {
              setProductError(null);
            }
          }}
          error={productError ?? undefined}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="warehouseId"
          className="text-ink-muted text-sm font-medium"
        >
          Bodega
        </label>
        <select
          id="warehouseId"
          {...register('warehouseId')}
          className="border-line bg-surface text-ink focus:border-accent aria-invalid:border-danger rounded-md border px-3 py-2 text-sm outline-none"
          aria-invalid={!!errors.warehouseId}
        >
          <option value="">Selecciona una bodega</option>
          {warehousesQuery.data?.data.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
        {errors.warehouseId && (
          <p className="text-danger text-xs">{errors.warehouseId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="quantity"
          className="text-ink-muted text-sm font-medium"
        >
          Cantidad{type === 'AJUSTE' ? ' (negativa para reducir)' : ''}
        </label>
        <input
          id="quantity"
          type="number"
          step="any"
          {...register('quantity', { valueAsNumber: true })}
          aria-invalid={!!errors.quantity}
          className="border-line bg-surface text-ink focus:border-accent aria-invalid:border-danger rounded-md border px-3 py-2 text-sm outline-none"
        />
        {errors.quantity && (
          <p className="text-danger text-xs">{errors.quantity.message}</p>
        )}
      </div>

      {type === 'ENTRADA' && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="unitCost"
            className="text-ink-muted text-sm font-medium"
          >
            Costo unitario (opcional)
          </label>
          <input
            id="unitCost"
            type="number"
            step="any"
            {...register('unitCost', {
              setValueAs: (value: string) =>
                value === '' ? undefined : Number(value),
            })}
            aria-invalid={!!errors.unitCost}
            className="border-line bg-surface text-ink focus:border-accent aria-invalid:border-danger rounded-md border px-3 py-2 text-sm outline-none"
          />
          {errors.unitCost && (
            <p className="text-danger text-xs">{errors.unitCost.message}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-ink-muted text-sm font-medium">
          Motivo{type === 'AJUSTE' ? '' : ' (opcional)'}
        </label>
        <input
          id="reason"
          type="text"
          {...register('reason')}
          aria-invalid={!!errors.reason}
          className="border-line bg-surface text-ink focus:border-accent aria-invalid:border-danger rounded-md border px-3 py-2 text-sm outline-none"
        />
        {errors.reason && (
          <p className="text-danger text-xs">{errors.reason.message}</p>
        )}
      </div>

      {createMovement.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {createMovement.error instanceof ApiError
            ? createMovement.error.message
            : 'No se pudo registrar el movimiento. Intenta de nuevo.'}
        </p>
      )}

      <button
        type="submit"
        disabled={createMovement.isPending}
        className="bg-accent text-on-accent hover:bg-accent-hover mt-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {createMovement.isPending ? 'Guardando…' : 'Registrar movimiento'}
      </button>
    </form>
  );
}
