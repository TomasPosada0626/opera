import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { TextField } from '../components/form/TextField';
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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-1 text-center">
          <span className="text-2xl font-medium tracking-tight text-ink">
            Opera
          </span>
          <span className="text-sm text-ink-muted">
            Gestión operativa empresarial
          </span>
        </div>

        <form
          onSubmit={(event) =>
            void handleSubmit((values) => loginMutation.mutate(values))(event)
          }
          noValidate
          className="border-line bg-surface-raised flex flex-col gap-4 rounded-xl border p-6 shadow-xl shadow-black/5 dark:shadow-black/20"
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

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="bg-accent text-on-accent hover:bg-accent-hover mt-2 rounded-md px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loginMutation.isPending ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
