import { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { RecoveryCodeModal } from './RecoveryCodeModal';
import { useRecoveryCodeStatus } from '../../hooks/useRecoveryCode';

// Aviso para cuentas sin código de recuperación — sobre todo las creadas
// antes de que existiera (instalaciones anteriores a la ronda 6): sin él,
// olvidar la contraseña en una instalación sin correo no tiene salida.
// Se puede cerrar por esta sesión; vuelve a aparecer al entrar de nuevo
// mientras siga faltando.
export function RecoveryCodeBanner() {
  const status = useRecoveryCodeStatus();
  const [dismissed, setDismissed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showBanner =
    status.data !== undefined && !status.data.hasRecoveryCode && !dismissed;

  if (!showBanner && !isModalOpen) {
    return null;
  }

  // Misma forma de árbol con o sin aviso: al generar el código, el aviso
  // desaparece (el estado pasa a "tiene código") y el modal no debe
  // remontarse, o se perdería el código que se está mostrando.
  return (
    <>
      {showBanner && (
        <div
          role="status"
          className="border-warning-line bg-warning-surface animate-fade-in mb-6 flex items-center gap-3 rounded-xl border px-4 py-3"
        >
          <KeyRound className="text-warning h-4.5 w-4.5 shrink-0" />
          <p className="text-ink-secondary flex-1 text-[13px]">
            <span className="text-ink font-medium">
              Tu cuenta no tiene código de recuperación.
            </span>{' '}
            Si olvidas la contraseña, es la única forma de volver a entrar.
          </p>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            Generar ahora
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Ocultar aviso"
            className="text-ink-muted hover:text-ink rounded-md p-1 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {isModalOpen && (
        <RecoveryCodeModal onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
}
