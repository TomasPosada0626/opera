import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { AuthShell } from '../components/auth/AuthShell';
import { TextField } from '../components/form/TextField';
import { Button } from '../components/ui/Button';
import { apiFetch, ApiError } from '../lib/api-client';
import { setAuthToken } from '../lib/auth-token';
import { loginIdentifierSchema } from '../lib/login-identifier';

const loginSchema = z.object({
  email: loginIdentifierSchema(),
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
    <AuthShell
      title="Iniciar sesión"
      subtitle="Entra con la cuenta de esta instalación."
      footer={
        <p className="text-center">
          <Link
            to="/olvide-contrasena"
            className="text-ink-muted hover:text-accent text-sm transition-colors"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      }
    >
      <form
        onSubmit={(event) =>
          void handleSubmit((values) => loginMutation.mutate(values))(event)
        }
        noValidate
        className="flex flex-col gap-4"
      >
        <TextField
          label="Usuario o correo"
          autoComplete="username"
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
            className="border-danger-line bg-danger-surface text-danger animate-fade-in rounded-lg border px-3.5 py-2.5 text-sm"
          >
            {loginMutation.error instanceof ApiError &&
            loginMutation.error.statusCode === 401
              ? 'Usuario o contraseña incorrectos.'
              : 'No se pudo iniciar sesión. Intenta de nuevo.'}
          </p>
        )}

        <Button
          type="submit"
          disabled={loginMutation.isPending}
          className="mt-2 h-10"
        >
          <LogIn />
          {loginMutation.isPending ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default LoginPage;
