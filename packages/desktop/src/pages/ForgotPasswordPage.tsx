import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { TextField } from '../components/form/TextField';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { ApiError } from '../lib/api-client';
import { useForgotPassword } from '../hooks/useForgotPassword';
import { useResetPasswordWithCode } from '../hooks/useResetPasswordWithCode';

const requestSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo').email('Correo inválido'),
});
type RequestFormValues = z.infer<typeof requestSchema>;

const verifySchema = z
  .object({
    code: z
      .string()
      .min(1, 'Ingresa el código')
      .regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
    newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
type VerifyFormValues = z.infer<typeof verifySchema>;

type Step = 'request' | 'verify' | 'done';

// Dos pasos en la misma pantalla (no dos rutas) porque el segundo depende
// por completo del primero (necesita el email que se acaba de enviar) — no
// hay ningún estado válido en el que alguien "llegue directo" al paso 2.
function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');

  const forgotPassword = useForgotPassword();
  const resetPassword = useResetPasswordWithCode();

  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
  });
  const verifyForm = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
  });

  function handleRequestSubmit(values: RequestFormValues) {
    forgotPassword.mutate(values.email, {
      onSuccess: () => {
        setEmail(values.email);
        setStep('verify');
      },
    });
  }

  function handleVerifySubmit(values: VerifyFormValues) {
    resetPassword.mutate(
      { email, code: values.code, newPassword: values.newPassword },
      { onSuccess: () => setStep('done') },
    );
  }

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
          <span className="text-ink-muted text-sm">Recuperar contraseña</span>
        </div>

        <div className="border-line bg-surface-raised flex flex-col gap-4 rounded-xl border p-6 shadow-2xl shadow-black/10 dark:shadow-black/70">
          {step === 'request' && (
            <form
              onSubmit={(event) =>
                void requestForm.handleSubmit(handleRequestSubmit)(event)
              }
              noValidate
              className="flex flex-col gap-4"
            >
              <p className="text-ink-muted text-sm">
                Ingresa tu correo. Si está registrado, te enviamos un código de
                verificación.
              </p>
              <TextField
                label="Correo"
                type="email"
                registration={requestForm.register('email')}
                error={requestForm.formState.errors.email}
              />
              {forgotPassword.isError && (
                <p
                  role="alert"
                  className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
                >
                  No se pudo procesar la solicitud. Intenta de nuevo.
                </p>
              )}
              <Button
                type="submit"
                disabled={forgotPassword.isPending}
                className="mt-2"
              >
                <KeyRound className="h-4 w-4" />
                {forgotPassword.isPending ? 'Enviando…' : 'Enviar código'}
              </Button>
            </form>
          )}

          {step === 'verify' && (
            <form
              onSubmit={(event) =>
                void verifyForm.handleSubmit(handleVerifySubmit)(event)
              }
              noValidate
              className="flex flex-col gap-4"
            >
              <p className="text-ink-muted text-sm">
                Si <strong className="text-ink">{email}</strong> está
                registrado, revisa tu correo por el código de 6 dígitos. Vence
                en 15 minutos.
              </p>
              <TextField
                label="Código"
                registration={verifyForm.register('code')}
                error={verifyForm.formState.errors.code}
              />
              <TextField
                label="Nueva contraseña"
                type="password"
                registration={verifyForm.register('newPassword')}
                error={verifyForm.formState.errors.newPassword}
              />
              <TextField
                label="Confirmar contraseña"
                type="password"
                registration={verifyForm.register('confirmPassword')}
                error={verifyForm.formState.errors.confirmPassword}
              />
              {resetPassword.isError && (
                <p
                  role="alert"
                  className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
                >
                  {resetPassword.error instanceof ApiError
                    ? resetPassword.error.message
                    : 'No se pudo actualizar la contraseña.'}
                </p>
              )}
              <Button
                type="submit"
                disabled={resetPassword.isPending}
                className="mt-2"
              >
                {resetPassword.isPending
                  ? 'Actualizando…'
                  : 'Actualizar contraseña'}
              </Button>
            </form>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p className="text-ink text-sm">Contraseña actualizada.</p>
              <Button
                onClick={() => void navigate('/login', { replace: true })}
              >
                Ir a iniciar sesión
              </Button>
            </div>
          )}
        </div>

        {step !== 'done' && (
          <div className="mt-4 text-center">
            <Link
              to="/login"
              className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a iniciar sesión
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
