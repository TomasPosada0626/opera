import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PackagePlus } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useCategories } from '../../hooks/useCategories';
import { useCreateProduct } from '../../hooks/useCreateProduct';
import { useUnits } from '../../hooks/useUnits';
import { useUpdateProduct } from '../../hooks/useUpdateProduct';
import { ApiError } from '../../lib/api-client';
import { PRODUCT_TYPE_LABELS, type Product } from '../../types/product';

// minStock/maxStock se quedan como string en el form (no number vía
// z.preprocess): un schema con preprocess da tipos de entrada/salida
// distintos, y el resolver de useForm exige que coincidan con
// ProductFormValues — mismo motivo por el que OrderForm maneja sus líneas
// como string y convierte a Number recién al armar el body.
const optionalNonNegativeString = z
  .string()
  .optional()
  .refine(
    (val) => !val || (!Number.isNaN(Number(val)) && Number(val) >= 0),
    'Debe ser 0 o mayor',
  );

const productSchema = z.object({
  sku: z.string().min(1, 'Ingresa un SKU'),
  name: z.string().min(2, 'Ingresa un nombre'),
  type: z.enum(['FINISHED_GOOD', 'RAW_MATERIAL', 'SUPPLY'], {
    message: 'Selecciona un tipo',
  }),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  unitId: z.string().min(1, 'Selecciona una unidad'),
  minStock: optionalNonNegativeString,
  maxStock: optionalNonNegativeString,
});
type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  product?: Product;
  onSuccess: () => void;
}

export function ProductForm({ product, onSuccess }: ProductFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      type: product?.type ?? 'FINISHED_GOOD',
      categoryId: product?.category.id ?? '',
      unitId: product?.unit.id ?? '',
      minStock: product?.minStock ?? '',
      maxStock: product?.maxStock ?? '',
    },
  });

  // pageSize 100, sin búsqueda: el <select> necesita todas las categorías/
  // unidades activas de una vez, mismo patrón que useWarehouses() en
  // OrderForm — no una página a la vez.
  const categoriesQuery = useCategories({ page: 1, pageSize: 100 });
  const unitsQuery = useUnits({ page: 1, pageSize: 100 });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const mutation = product ? updateProduct : createProduct;

  function onSubmit(values: ProductFormValues) {
    const body = {
      sku: values.sku,
      name: values.name,
      type: values.type,
      categoryId: values.categoryId,
      unitId: values.unitId,
      minStock: values.minStock ? Number(values.minStock) : undefined,
      maxStock: values.maxStock ? Number(values.maxStock) : undefined,
    };

    if (product) {
      updateProduct.mutate({ id: product.id, ...body }, { onSuccess });
    } else {
      createProduct.mutate(body, { onSuccess });
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <TextField
        label="SKU"
        registration={register('sku')}
        error={errors.sku}
      />
      <TextField
        label="Nombre"
        registration={register('name')}
        error={errors.name}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-ink-muted text-sm font-medium">
          Tipo
        </label>
        <select
          id="type"
          {...register('type')}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          aria-invalid={!!errors.type}
        >
          {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {errors.type && (
          <p className="text-danger text-xs">{errors.type.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="categoryId"
          className="text-ink-muted text-sm font-medium"
        >
          Categoría
        </label>
        <select
          id="categoryId"
          {...register('categoryId')}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          aria-invalid={!!errors.categoryId}
        >
          <option value="">Selecciona una categoría</option>
          {categoriesQuery.data?.data.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p className="text-danger text-xs">{errors.categoryId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="unitId" className="text-ink-muted text-sm font-medium">
          Unidad
        </label>
        <select
          id="unitId"
          {...register('unitId')}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          aria-invalid={!!errors.unitId}
        >
          <option value="">Selecciona una unidad</option>
          {unitsQuery.data?.data.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({unit.abbreviation})
            </option>
          ))}
        </select>
        {errors.unitId && (
          <p className="text-danger text-xs">{errors.unitId.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="minStock"
            className="text-ink-muted text-sm font-medium"
          >
            Stock mínimo (opcional)
          </label>
          <input
            id="minStock"
            type="number"
            step="any"
            min="0"
            {...register('minStock')}
            aria-invalid={!!errors.minStock}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          {errors.minStock && (
            <p className="text-danger text-xs">{errors.minStock.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="maxStock"
            className="text-ink-muted text-sm font-medium"
          >
            Stock máximo (opcional)
          </label>
          <input
            id="maxStock"
            type="number"
            step="any"
            min="0"
            {...register('maxStock')}
            aria-invalid={!!errors.maxStock}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          {errors.maxStock && (
            <p className="text-danger text-xs">{errors.maxStock.message}</p>
          )}
        </div>
      </div>

      {mutation.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'No se pudo guardar el producto. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-1">
        <PackagePlus className="h-4 w-4" />
        {mutation.isPending
          ? 'Guardando…'
          : product
            ? 'Guardar cambios'
            : 'Crear producto'}
      </Button>
    </form>
  );
}
