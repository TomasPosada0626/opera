import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { z } from 'zod';
import { TextField } from '../form/TextField';
import { Button } from '../ui/Button';
import { useResetUserPassword } from '../../hooks/useResetUserPassword';
import { ApiError } from '../../lib/api-client';

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordFormProps {
  userId: string;
  onSuccess: () => void;
}

export function ResetPasswordForm({
  userId,
  onSuccess,
}: ResetPasswordFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '' },
  });

  const resetPassword = useResetUserPassword();

  function onSubmit(values: ResetPasswordFormValues) {
    resetPassword.mutate(
      { id: userId, newPassword: values.newPassword },
      { onSuccess },
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <TextField
        label="Nueva contraseña"
        type="password"
        registration={register('newPassword')}
        error={errors.newPassword}
      />

      {resetPassword.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {resetPassword.error instanceof ApiError
            ? resetPassword.error.message
            : 'No se pudo resetear la contraseña. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={resetPassword.isPending} className="mt-1">
        <KeyRound className="h-4 w-4" />
        {resetPassword.isPending ? 'Guardando…' : 'Resetear contraseña'}
      </Button>
    </form>
  );
}
