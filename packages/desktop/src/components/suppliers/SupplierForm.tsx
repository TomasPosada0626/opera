import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useCreateSupplier } from '../../hooks/useCreateSupplier';
import { useUpdateSupplier } from '../../hooks/useUpdateSupplier';
import { ApiError } from '../../lib/api-client';
import type { Supplier } from '../../types/supplier';

// email vacío ('') es válido (campo opcional, un <input> controlado nunca
// manda undefined) — solo se valida el formato cuando sí escriben algo.
const supplierSchema = z.object({
  name: z.string().min(2, 'Ingresa un nombre'),
  taxId: z.string().optional(),
  email: z.literal('').or(z.string().email('Correo inválido')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

interface SupplierFormProps {
  // Sin supplier = crear; con supplier = editar (mismo form, mismos campos).
  supplier?: Supplier;
  onSuccess: () => void;
}

export function SupplierForm({ supplier, onSuccess }: SupplierFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      taxId: supplier?.taxId ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      address: supplier?.address ?? '',
    },
  });

  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const mutation = supplier ? updateSupplier : createSupplier;

  function onSubmit(values: SupplierFormValues) {
    // Vacío -> undefined: el backend guarda NULL, no una cadena vacía, y
    // @IsOptional() en el DTO solo se salta la validación si el campo es
    // undefined, no si llega ''.
    const body = {
      name: values.name,
      taxId: values.taxId || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
    };

    if (supplier) {
      updateSupplier.mutate({ id: supplier.id, ...body }, { onSuccess });
    } else {
      createSupplier.mutate(body, { onSuccess });
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
        label="NIT / identificación (opcional)"
        registration={register('taxId')}
        error={errors.taxId}
      />
      <TextField
        label="Correo (opcional)"
        type="email"
        registration={register('email')}
        error={errors.email}
      />
      <TextField
        label="Teléfono (opcional)"
        registration={register('phone')}
        error={errors.phone}
      />
      <TextField
        label="Dirección (opcional)"
        registration={register('address')}
        error={errors.address}
      />

      {mutation.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'No se pudo guardar el proveedor. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-1">
        <UserPlus className="h-4 w-4" />
        {mutation.isPending
          ? 'Guardando…'
          : supplier
            ? 'Guardar cambios'
            : 'Crear proveedor'}
      </Button>
    </form>
  );
}
