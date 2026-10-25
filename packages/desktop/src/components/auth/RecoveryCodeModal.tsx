import { useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { RecoveryCodeDisplay } from './RecoveryCodeDisplay';
import {
  useIssueRecoveryCode,
  useRecoveryCodeStatus,
} from '../../hooks/useRecoveryCode';
import { formatDate } from '../../lib/format';

interface RecoveryCodeModalProps {
  onClose: () => void;
}

// Generar (o rotar) el código de recuperación desde la sesión. Generar uno
// nuevo invalida el anterior, por eso pide confirmación implícita con el
// texto del botón cuando ya existe uno.
export function RecoveryCodeModal({ onClose }: RecoveryCodeModalProps) {
  const status = useRecoveryCodeStatus();
  const issue = useIssueRecoveryCode();
  const [code, setCode] = useState<string | null>(null);

  const hasCode = status.data?.hasRecoveryCode ?? false;

  return (
    <Modal title="Código de recuperación" onClose={onClose}>
      {code ? (
        <div className="flex flex-col gap-5">
          <RecoveryCodeDisplay code={code} />
          <Button onClick={onClose}>Ya lo anoté</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                hasCode
                  ? 'border-success-line bg-success-surface text-success'
                  : 'border-warning-line bg-warning-surface text-warning'
              }`}
            >
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-ink text-sm font-medium">
                {status.isLoading
                  ? 'Revisando…'
                  : hasCode
                    ? 'Tu cuenta ya tiene un código de recuperación'
                    : 'Tu cuenta todavía no tiene código de recuperación'}
              </p>
              <p className="text-ink-muted mt-0.5 text-[13px]">
                {hasCode && status.data?.createdAt
                  ? `Generado el ${formatDate(status.data.createdAt)}. Si lo perdiste, genera uno nuevo: el anterior deja de servir.`
                  : 'Sin él, si olvidas la contraseña no hay forma de volver a entrar.'}
              </p>
            </div>
          </div>
          <FormError
            error={issue.error}
            fallback="No se pudo generar el código. Intenta de nuevo."
          />
          <Button
            disabled={issue.isPending || status.isLoading}
            onClick={() =>
              issue.mutate(undefined, {
                onSuccess: ({ recoveryCode }) => setCode(recoveryCode),
              })
            }
          >
            <RefreshCw />
            {issue.isPending
              ? 'Generando…'
              : hasCode
                ? 'Generar uno nuevo'
                : 'Generar código'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
