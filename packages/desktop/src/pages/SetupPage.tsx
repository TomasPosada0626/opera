import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { AuthShell } from '../components/auth/AuthShell';
import { RecoveryCodeDisplay } from '../components/auth/RecoveryCodeDisplay';
import { TextField } from '../components/form/TextField';
import { Button } from '../components/ui/Button';
import { apiFetch, ApiError } from '../lib/api-client';
import { setAuthToken } from '../lib/auth-token';
import { loginIdentifierSchema } from '../lib/login-identifier';

const setupSchema = z
  .object({
    name: z.string().min(1, 'Ingresa tu nombre'),
    email: loginIdentifierSchema('Elige un usuario'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
type SetupFormValues = z.infer<typeof setupSchema>;

interface SetupResponse {
  accessToken: string;
  // Primer código de recuperación de la cuenta — se muestra una sola vez.
  recoveryCode: string;
}

// Primer arranque de una instalación: crea la cuenta de administrador y,
// antes de entrar, muestra su código de recuperación para anotarlo. Sin
// él, en una instalación sin correo olvidar la contraseña dejaba el
// sistema sin entrada posible (auditoría ronda 6).
function SetupPage() {
  const navigate = useNavigate();
  const [created, setCreated] = useState<SetupResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupFormValues>({ resolver: zodResolver(setupSchema) });

  const setupMutation = useMutation({
    mutationFn: (values: SetupFormValues) =>
      apiFetch<SetupResponse>('/setup/admin', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
        }),
      }),
    onSuccess: (response) => setCreated(response),
  });

  function enter() {
    if (!created) {
      return;
    }
    setAuthToken(created.accessToken);
    void navigate('/', { replace: true });
  }

  if (created) {
    return (
      <AuthShell
        title="Guarda tu código de recuperación"
        subtitle="La cuenta quedó creada. Este código es la llave de repuesto si algún día olvidas la contraseña."
      >
        <div className="flex flex-col gap-6">
          <RecoveryCodeDisplay code={created.recoveryCode} />
          <div className="flex items-start gap-3">
            <input
              id="recoveryCodeSaved"
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="accent-accent mt-0.5 h-4 w-4 cursor-pointer"
            />
            <label
              htmlFor="recoveryCodeSaved"
              className="text-ink-secondary cursor-pointer text-sm"
            >
              Ya lo anoté en un lugar seguro
            </label>
          </div>
          <Button disabled={!confirmed} onClick={enter} className="h-10">
            Entrar a Opera
            <ArrowRight />
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Configuración inicial"
      subtitle="Es la primera vez que se abre Opera en esta PC. Crea la cuenta de administrador que vas a usar para entrar; queda guardada solo acá."
    >
      <form
        onSubmit={(event) =>
          void handleSubmit((values) => setupMutation.mutate(values))(event)
        }
        noValidate
        className="flex flex-col gap-4"
      >
        <TextField
          label="Nombre"
          registration={register('name')}
          error={errors.name}
        />
        <TextField
          label="Usuario o correo"
          autoComplete="username"
          placeholder="Ej. herrajestoro"
          registration={register('email')}
          error={errors.email}
        />
        <TextField
          label="Contraseña"
          type="password"
          registration={register('password')}
          error={errors.password}
        />
        <TextField
          label="Confirmar contraseña"
          type="password"
          registration={register('confirmPassword')}
          error={errors.confirmPassword}
        />

        {setupMutation.isError && (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {setupMutation.error instanceof ApiError &&
            setupMutation.error.statusCode === 409
              ? 'Ya existe un administrador configurado en esta instalación.'
              : 'No se pudo crear la cuenta. Intenta de nuevo.'}
          </p>
        )}

        <Button
          type="submit"
          disabled={setupMutation.isPending}
          className="mt-2 h-10"
        >
          <UserPlus />
          {setupMutation.isPending ? 'Creando…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default SetupPage;
