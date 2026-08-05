import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { TextField } from '../components/form/TextField';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { apiFetch, ApiError } from '../lib/api-client';
import { setAuthToken } from '../lib/auth-token';

const loginSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo').email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
type LoginFormValues = z.infer<typeof loginSchema>;

interface LoginResponse {
  accessToken: string;
}

function LoginPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const loginMutation = useMutation({
    mutationFn: (values: LoginFormValues) =>
      apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: ({ accessToken }) => {
      setAuthToken(accessToken);
      void navigate('/', { replace: true });
    },
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Logo size={48} showWordmark />
          <span className="text-sm text-ink-muted">
            Gestión operativa empresarial
          </span>
        </div>

        <form
          onSubmit={(event) =>
            void handleSubmit((values) => loginMutation.mutate(values))(event)
          }
          noValidate
          className="border-line bg-surface-raised flex flex-col gap-4 rounded-xl border p-6 shadow-xl shadow-black/10 dark:shadow-black/60"
        >
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

          {loginMutation.isError && (
            <p
              role="alert"
              className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
            >
              {loginMutation.error instanceof ApiError &&
              loginMutation.error.statusCode === 401
                ? 'Correo o contraseña incorrectos.'
                : 'No se pudo iniciar sesión. Intenta de nuevo.'}
            </p>
          )}

          <Button
            type="submit"
            disabled={loginMutation.isPending}
            className="mt-2"
          >
            <LogIn className="h-4 w-4" />
            {loginMutation.isPending ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
