import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tag } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useCreateCategory } from '../../hooks/useCreateCategory';
import { useUpdateCategory } from '../../hooks/useUpdateCategory';
import { ApiError } from '../../lib/api-client';
import type { Category } from '../../types/product';

const categorySchema = z.object({
  name: z.string().min(2, 'Ingresa un nombre'),
});
type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  category?: Category;
  onSuccess: () => void;
}

export function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? '' },
  });

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const mutation = category ? updateCategory : createCategory;

  function onSubmit(values: CategoryFormValues) {
    if (category) {
      updateCategory.mutate({ id: category.id, ...values }, { onSuccess });
    } else {
      createCategory.mutate(values, { onSuccess });
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <TextField
        label="Nombre"
        registration={register('name')}
        error={errors.name}
      />

      {mutation.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'No se pudo guardar la categoría. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-1">
        <Tag className="h-4 w-4" />
        {mutation.isPending
          ? 'Guardando…'
          : category
            ? 'Guardar cambios'
            : 'Crear categoría'}
      </Button>
    </form>
  );
}
