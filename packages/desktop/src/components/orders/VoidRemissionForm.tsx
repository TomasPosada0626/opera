import { useState, type FormEvent } from 'react';
import { Ban } from 'lucide-react';
import { Button } from '../ui/Button';
import { useVoidRemission } from '../../hooks/useVoidRemission';
import { ApiError } from '../../lib/api-client';
import type { Remission } from '../../types/order';

interface VoidRemissionFormProps {
  orderId: string;
  remission: Remission;
  onSuccess: () => void;
}

// Anular no borra ni edita la remisión (append-only, ver schema.prisma) —
// el motivo es obligatorio porque queda como el registro de por qué se
// escribió la ENTRADA de reverso en el Kardex.
export function VoidRemissionForm({
  orderId,
  remission,
  onSuccess,
}: VoidRemissionFormProps) {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const voidRemission = useVoidRemission();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (reason.trim().length < 3) {
      setFormError('Ingresa el motivo de la anulación (mínimo 3 caracteres).');
      return;
    }
    setFormError(null);

    voidRemission.mutate(
      { remissionId: remission.id, orderId, reason: reason.trim() },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-ink-muted text-sm">
        Esto no borra la remisión — queda marcada como anulada, con el motivo, y
        se corrige el stock con una entrada de reverso.
      </p>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="voidReason"
          className="text-ink-muted text-sm font-medium"
        >
          Motivo de la anulación
        </label>
        <textarea
          id="voidReason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
      </div>

      {formError && (
        <p role="alert" className="text-danger text-xs">
          {formError}
        </p>
      )}
      {voidRemission.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {voidRemission.error instanceof ApiError
            ? voidRemission.error.message
            : 'No se pudo anular la remisión. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={voidRemission.isPending} className="mt-1">
        <Ban className="h-4 w-4" />
        {voidRemission.isPending ? 'Anulando…' : 'Anular remisión'}
      </Button>
    </form>
  );
}
