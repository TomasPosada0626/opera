import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ruler } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useCreateUnit } from '../../hooks/useCreateUnit';
import { useUpdateUnit } from '../../hooks/useUpdateUnit';
import { ApiError } from '../../lib/api-client';
import type { Unit } from '../../types/product';

const unitSchema = z.object({
  name: z.string().min(2, 'Ingresa un nombre'),
  abbreviation: z.string().min(1, 'Ingresa una abreviación'),
});
type UnitFormValues = z.infer<typeof unitSchema>;

interface UnitFormProps {
  unit?: Unit;
  onSuccess: () => void;
}

export function UnitForm({ unit, onSuccess }: UnitFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      name: unit?.name ?? '',
      abbreviation: unit?.abbreviation ?? '',
    },
  });

  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const mutation = unit ? updateUnit : createUnit;

  function onSubmit(values: UnitFormValues) {
    if (unit) {
      updateUnit.mutate({ id: unit.id, ...values }, { onSuccess });
    } else {
      createUnit.mutate(values, { onSuccess });
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
        label="Abreviación"
        registration={register('abbreviation')}
        error={errors.abbreviation}
      />

      {mutation.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'No se pudo guardar la unidad. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-1">
        <Ruler className="h-4 w-4" />
        {mutation.isPending
          ? 'Guardando…'
          : unit
            ? 'Guardar cambios'
            : 'Crear unidad'}
      </Button>
    </form>
  );
}
