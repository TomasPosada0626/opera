import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Warehouse as WarehouseIcon } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useCreateWarehouse } from '../../hooks/useCreateWarehouse';
import { useUpdateWarehouse } from '../../hooks/useUpdateWarehouse';
import { ApiError } from '../../lib/api-client';
import type { Warehouse } from '../../types/inventory';

const warehouseSchema = z.object({
  name: z.string().min(2, 'Ingresa un nombre'),
  location: z.string().optional(),
});
type WarehouseFormValues = z.infer<typeof warehouseSchema>;

interface WarehouseFormProps {
  warehouse?: Warehouse;
  onSuccess: () => void;
}

export function WarehouseForm({ warehouse, onSuccess }: WarehouseFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: warehouse?.name ?? '',
      location: warehouse?.location ?? '',
    },
  });

  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const mutation = warehouse ? updateWarehouse : createWarehouse;

  function onSubmit(values: WarehouseFormValues) {
    // Vacío -> undefined: el backend guarda NULL, no una cadena vacía (mismo
    // patrón que CustomerForm).
    const body = {
      name: values.name,
      location: values.location || undefined,
    };

    if (warehouse) {
      updateWarehouse.mutate({ id: warehouse.id, ...body }, { onSuccess });
    } else {
      createWarehouse.mutate(body, { onSuccess });
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
      <TextField
        label="Ubicación (opcional)"
        registration={register('location')}
        error={errors.location}
      />

      {mutation.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'No se pudo guardar la bodega. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-1">
        <WarehouseIcon className="h-4 w-4" />
        {mutation.isPending
          ? 'Guardando…'
          : warehouse
            ? 'Guardar cambios'
            : 'Crear bodega'}
      </Button>
    </form>
  );
}
