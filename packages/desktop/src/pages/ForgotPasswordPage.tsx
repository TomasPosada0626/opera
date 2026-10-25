import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { AuthShell } from '../components/auth/AuthShell';
import { RecoveryCodeDisplay } from '../components/auth/RecoveryCodeDisplay';
import { TextField } from '../components/form/TextField';
import { Button } from '../components/ui/Button';
import { ApiError } from '../lib/api-client';
import { useForgotPassword } from '../hooks/useForgotPassword';
import {
  useRecoveryOptions,
  useResetWithRecoveryCode,
} from '../hooks/useRecoveryCode';
import { useResetPasswordWithCode } from '../hooks/useResetPasswordWithCode';

const requestSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo').email('Correo inválido'),
});
type RequestFormValues = z.infer<typeof requestSchema>;

const passwordFields = {
  newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string().min(1, 'Confirma la contraseña'),
};
const passwordsMatch = {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
};

const verifySchema = z
  .object({
    code: z
      .string()
      .min(1, 'Ingresa el código')
      .regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
    ...passwordFields,
  })
  .refine((data) => data.newPassword === data.confirmPassword, passwordsMatch);
type VerifyFormValues = z.infer<typeof verifySchema>;

const recoverySchema = z
  .object({
    email: z.string().min(1, 'Ingresa tu correo').email('Correo inválido'),
    recoveryCode: z
      .string()
      .min(1, 'Ingresa el código de recuperación')
      .refine(
        (value) => value.replace(/[\s-]/g, '').length === 16,
        'El código tiene 16 caracteres (por ejemplo 7K2M-QX9D-4HPA-T3VR)',
      ),
    ...passwordFields,
  })
  .refine((data) => data.newPassword === data.confirmPassword, passwordsMatch);
type RecoveryFormValues = z.infer<typeof recoverySchema>;

type Mode = 'email' | 'recovery';
type Step = 'request' | 'verify' | 'done';

const errorBoxClassName =
  'border-danger-line bg-danger-surface text-danger rounded-lg border px-3.5 py-2.5 text-sm';

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const options = useRecoveryOptions();
  const emailEnabled = options.data?.email ?? false;
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  // Sin correo configurado (la app de escritorio), el código de
  // recuperación es la única vía y se muestra directo.
  const mode: Mode = chosenMode ?? (emailEnabled ? 'email' : 'recovery');
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);

  const forgotPassword = useForgotPassword();
  const resetPassword = useResetPasswordWithCode();
  const resetWithRecoveryCode = useResetWithRecoveryCode();

  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
  });
  const verifyForm = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
  });
  const recoveryForm = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoverySchema),
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

  function handleRecoverySubmit(values: RecoveryFormValues) {
    resetWithRecoveryCode.mutate(
      {
        email: values.email,
        recoveryCode: values.recoveryCode,
        newPassword: values.newPassword,
      },
      {
        onSuccess: ({ recoveryCode }) => {
          setNewRecoveryCode(recoveryCode);
          setStep('done');
        },
      },
    );
  }

  const backToLogin = (
    <p className="text-center">
      <Link
        to="/login"
        className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a iniciar sesión
      </Link>
    </p>
  );

  if (step === 'done') {
    return (
      <AuthShell
        title="Contraseña actualizada."
        subtitle={
          newRecoveryCode
            ? 'El código que usaste ya no sirve. Este es el nuevo: anótalo antes de seguir.'
            : 'Ya puedes entrar con la nueva contraseña.'
        }
      >
        <div className="flex flex-col gap-6">
          {newRecoveryCode && <RecoveryCodeDisplay code={newRecoveryCode} />}
          <Button
            className="h-10"
            onClick={() => void navigate('/login', { replace: true })}
          >
            Ir a iniciar sesión
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle={
        mode === 'recovery'
          ? 'Con el código de recuperación que anotaste al crear la cuenta (o el último que generaste).'
          : 'Te enviamos un código de verificación al correo de la cuenta.'
      }
      footer={backToLogin}
    >
      {emailEnabled && step === 'request' && (
        <div
          role="group"
          aria-label="Forma de recuperación"
          className="border-line bg-chrome mb-6 grid grid-cols-2 gap-1 rounded-xl border p-1"
        >
          {(
            [
              ['email', 'Por correo', Mail],
              ['recovery', 'Con código', KeyRound],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setChosenMode(value)}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                mode === value
                  ? 'bg-surface-raised text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'recovery' && (
        <form
          onSubmit={(event) =>
            void recoveryForm.handleSubmit(handleRecoverySubmit)(event)
          }
          noValidate
          className="flex flex-col gap-4"
        >
          <TextField
            label="Correo"
            type="email"
            registration={recoveryForm.register('email')}
            error={recoveryForm.formState.errors.email}
          />
          <TextField
            label="Código de recuperación"
            registration={recoveryForm.register('recoveryCode')}
            error={recoveryForm.formState.errors.recoveryCode}
          />
          <TextField
            label="Nueva contraseña"
            type="password"
            registration={recoveryForm.register('newPassword')}
            error={recoveryForm.formState.errors.newPassword}
          />
          <TextField
            label="Confirmar contraseña"
            type="password"
            registration={recoveryForm.register('confirmPassword')}
            error={recoveryForm.formState.errors.confirmPassword}
          />
          {resetWithRecoveryCode.isError && (
            <p role="alert" className={errorBoxClassName}>
              {resetWithRecoveryCode.error instanceof ApiError
                ? resetWithRecoveryCode.error.message
                : 'No se pudo actualizar la contraseña.'}
            </p>
          )}
          <Button
            type="submit"
            disabled={resetWithRecoveryCode.isPending}
            className="mt-2 h-10"
          >
            <KeyRound />
            {resetWithRecoveryCode.isPending
              ? 'Actualizando…'
              : 'Restablecer contraseña'}
          </Button>
        </form>
      )}

      {mode === 'email' && step === 'request' && (
        <form
          onSubmit={(event) =>
            void requestForm.handleSubmit(handleRequestSubmit)(event)
          }
          noValidate
          className="flex flex-col gap-4"
        >
          <TextField
            label="Correo"
            type="email"
            registration={requestForm.register('email')}
            error={requestForm.formState.errors.email}
          />
          {forgotPassword.isError && (
            <p role="alert" className={errorBoxClassName}>
              No se pudo procesar la solicitud. Intenta de nuevo.
            </p>
          )}
          <Button
            type="submit"
            disabled={forgotPassword.isPending}
            className="mt-2 h-10"
          >
            <Mail />
            {forgotPassword.isPending ? 'Enviando…' : 'Enviar código'}
          </Button>
        </form>
      )}

      {mode === 'email' && step === 'verify' && (
        <form
          onSubmit={(event) =>
            void verifyForm.handleSubmit(handleVerifySubmit)(event)
          }
          noValidate
          className="flex flex-col gap-4"
        >
          <p className="text-ink-muted text-sm">
            Si <strong className="text-ink">{email}</strong> está registrado,
            revisa tu correo por el código de 6 dígitos. Vence en 15 minutos.
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
            <p role="alert" className={errorBoxClassName}>
              {resetPassword.error instanceof ApiError
                ? resetPassword.error.message
                : 'No se pudo actualizar la contraseña.'}
            </p>
          )}
          <Button
            type="submit"
            disabled={resetPassword.isPending}
            className="mt-2 h-10"
          >
            {resetPassword.isPending
              ? 'Actualizando…'
              : 'Actualizar contraseña'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default ForgotPasswordPage;
