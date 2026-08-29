import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  isPending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmación genérica antes de una mutación sin vuelta atrás — hallazgo
// P1 de la auditoría 2026-08-28 (DeleteSupplierProductAction borraba de
// forma permanente directo desde el onClick, sin ningún paso intermedio).
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Eliminar',
  isPending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-ink-muted text-sm">{message}</p>
      {error && <p className="text-danger mt-3 text-sm">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={isPending}>
          {isPending ? 'Eliminando…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
