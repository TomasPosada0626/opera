import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useCreateCustomer } from '../../hooks/useCreateCustomer';
import { useUpdateCustomer } from '../../hooks/useUpdateCustomer';
import { ApiError } from '../../lib/api-client';
import type { Customer } from '../../types/customer';

// email vacío ('') es válido (campo opcional, un <input> controlado nunca
// manda undefined) — solo se valida el formato cuando sí escriben algo.
const customerSchema = z.object({
  name: z.string().min(2, 'Ingresa un nombre'),
  taxId: z.string().optional(),
  email: z.literal('').or(z.string().email('Correo inválido')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

interface CustomerFormProps {
  // Sin customer = crear; con customer = editar (mismo form, mismos campos).
  customer?: Customer;
  onSuccess: () => void;
}

export function CustomerForm({ customer, onSuccess }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name ?? '',
      taxId: customer?.taxId ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      address: customer?.address ?? '',
    },
  });

  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const mutation = customer ? updateCustomer : createCustomer;

  function onSubmit(values: CustomerFormValues) {
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

    if (customer) {
      updateCustomer.mutate({ id: customer.id, ...body }, { onSuccess });
    } else {
      createCustomer.mutate(body, { onSuccess });
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
            : 'No se pudo guardar el cliente. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-1">
        <UserPlus className="h-4 w-4" />
        {mutation.isPending
          ? 'Guardando…'
          : customer
            ? 'Guardar cambios'
            : 'Crear cliente'}
      </Button>
    </form>
  );
}
