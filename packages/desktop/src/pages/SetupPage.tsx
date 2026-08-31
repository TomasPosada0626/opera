import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { TextField } from '../components/form/TextField';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { apiFetch, ApiError } from '../lib/api-client';
import { setAuthToken } from '../lib/auth-token';

const setupSchema = z
  .object({
    name: z.string().min(1, 'Ingresa tu nombre'),
    email: z.string().min(1, 'Ingresa tu correo').email('Correo inválido'),
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
}

// Se llega acá solo cuando GET /setup/status reporta needsSetup: true (ver
// el loader de /login en router.tsx) -- esta cuenta queda como la única
// administradora de esta instalación, guardada solo en su base de datos
// local, nunca una credencial repartida por .env (auditoría 2026-08-28).
function SetupPage() {
  const navigate = useNavigate();
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
    onSuccess: ({ accessToken }) => {
      setAuthToken(accessToken);
      void navigate('/', { replace: true });
    },
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="bg-accent/[0.14] dark:bg-accent/[0.2] pointer-events-none absolute top-[38%] left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px]"
      />
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Logo size={48} showWordmark />
          <span className="text-ink-muted text-sm">
            Configuración inicial de esta instalación
          </span>
        </div>

        <form
          onSubmit={(event) =>
            void handleSubmit((values) => setupMutation.mutate(values))(event)
          }
          noValidate
          className="border-line bg-surface-raised flex flex-col gap-4 rounded-xl border p-6 shadow-2xl shadow-black/10 dark:shadow-black/70"
        >
          <p className="text-ink-muted text-sm">
            Es la primera vez que se abre Opera en esta PC. Creá la cuenta de
            administrador que vas a usar para entrar — queda guardada solo acá.
          </p>
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
              className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
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
            className="mt-2"
          >
            <UserPlus className="h-4 w-4" />
            {setupMutation.isPending ? 'Creando…' : 'Crear cuenta y entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default SetupPage;
