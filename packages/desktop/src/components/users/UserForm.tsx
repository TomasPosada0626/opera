import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useCreateUser } from '../../hooks/useCreateUser';
import { useUpdateUser } from '../../hooks/useUpdateUser';
import { useRoles } from '../../hooks/useRoles';
import { ApiError } from '../../lib/api-client';
import type { User } from '../../types/user';

// password solo se pide al crear — editar contraseña es un flujo aparte
// (ResetPasswordForm, contra PATCH :id/reset-password), nunca este form.
// El schema se arma según isEditing (fijo durante la vida del componente,
// el modal se remonta al alternar crear/editar) para que la validación de
// longitud mínima solo aplique al crear, sin dos schemas con tipos que
// terminan divergiendo.
function buildSchema(isEditing: boolean) {
  return z.object({
    email: z.string().email('Correo inválido'),
    name: z.string().min(2, 'Ingresa un nombre'),
    password: isEditing ? z.string() : z.string().min(8, 'Mínimo 8 caracteres'),
    roleIds: z.array(z.string()),
  });
}

type UserFormValues = z.infer<ReturnType<typeof buildSchema>>;

interface UserFormProps {
  // Sin user = crear; con user = editar (mismo form, sin campo de contraseña).
  user?: User;
  onSuccess: () => void;
}

export function UserForm({ user, onSuccess }: UserFormProps) {
  const rolesQuery = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const mutation = user ? updateUser : createUser;
  const currentRoleIds = user?.roles.map(({ role }) => role.id) ?? [];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(buildSchema(!!user)),
    defaultValues: {
      email: user?.email ?? '',
      name: user?.name ?? '',
      password: '',
      roleIds: currentRoleIds,
    },
  });

  const selectedRoleIds = watch('roleIds');

  function toggleRole(roleId: string, checked: boolean) {
    setValue(
      'roleIds',
      checked
        ? [...selectedRoleIds, roleId]
        : selectedRoleIds.filter((id) => id !== roleId),
    );
  }

  function onSubmit(values: UserFormValues) {
    if (user) {
      updateUser.mutate(
        {
          id: user.id,
          email: values.email,
          name: values.name,
          roleIds: values.roleIds,
        },
        { onSuccess },
      );
    } else {
      createUser.mutate(
        {
          email: values.email,
          name: values.name,
          password: values.password,
          roleIds: values.roleIds,
        },
        { onSuccess },
      );
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
        label="Correo"
        type="email"
        registration={register('email')}
        error={errors.email}
      />
      {!user && (
        <TextField
          label="Contraseña"
          type="password"
          registration={register('password')}
          error={errors.password}
        />
      )}

      <div className="flex flex-col gap-1">
        <span className="text-ink-muted text-sm font-medium">Roles</span>
        {rolesQuery.isLoading && (
          <p className="text-ink-muted text-sm">Cargando roles…</p>
        )}
        {rolesQuery.data?.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedRoleIds.includes(role.id)}
              onChange={(event) => toggleRole(role.id, event.target.checked)}
              className="accent-accent h-4 w-4"
            />
            {role.name}
          </label>
        ))}
      </div>

      {mutation.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'No se pudo guardar el usuario. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-1">
        <UserPlus className="h-4 w-4" />
        {mutation.isPending
          ? 'Guardando…'
          : user
            ? 'Guardar cambios'
            : 'Crear usuario'}
      </Button>
    </form>
  );
}
