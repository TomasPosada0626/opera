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
          <span className="text-2xl font-bold tracking-tight text-slate-50">
            Opera
          </span>
          <span className="text-sm text-slate-500">
            Gestión operativa empresarial
          </span>
        </div>

        <form
          onSubmit={(event) =>
            void handleSubmit((values) => loginMutation.mutate(values))(event)
          }
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20"
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
              className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400"
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
            className="mt-2 rounded-md bg-amber-500 px-4 py-2 font-medium text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loginMutation.isPending ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
