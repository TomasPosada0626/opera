import { useEffect, useState } from 'react';
import { AlertTriangle, ArchiveRestore, Database, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { formatDateTime } from '../../lib/format';

interface BackupsModalProps {
  onClose: () => void;
  // Qué hacer después de restaurar: la base cambió por completo, así que
  // la sesión actual ya no es confiable (el usuario puede no existir en el
  // respaldo).
  onRestored: () => void;
}

const CONFIRM_WORD = 'RESTAURAR';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Respaldos automáticos guardados en el perfil y restauración con un click
// (backend-manager.ts hace un respaldo de seguridad antes y aplica todo en
// una transacción). Pide escribir RESTAURAR: reemplaza TODOS los datos
// actuales por los del respaldo, no es una acción para hacer sin querer.
export function BackupsModal({ onClose, onRestored }: BackupsModalProps) {
  const [backups, setBackups] = useState<BackupFile[] | null>(null);
  const [selected, setSelected] = useState<BackupFile | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.appBackend?.listBackups().then(setBackups);
  }, []);

  async function restore() {
    if (!selected || !window.appBackend) {
      return;
    }
    setIsRestoring(true);
    setError(null);
    const result = await window.appBackend.restoreBackup(selected.name);
    setIsRestoring(false);
    if (result.ok) {
      onRestored();
    } else {
      setError(result.error);
    }
  }

  if (selected) {
    return (
      <Modal
        title="Restaurar respaldo"
        description={formatDateTime(selected.createdAt)}
        onClose={isRestoring ? () => undefined : onClose}
      >
        <div className="flex flex-col gap-5">
          <div className="border-warning-line bg-warning-surface flex gap-3 rounded-xl border px-4 py-3">
            <AlertTriangle className="text-warning mt-0.5 h-4.5 w-4.5 shrink-0" />
            <p className="text-ink-secondary text-[13px] leading-5">
              Todos los datos actuales (pedidos, inventario, clientes, abonos)
              se reemplazan por los de este respaldo. Antes de hacerlo, Opera
              guarda un respaldo del estado actual por si necesitas volver.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirmRestore"
              className="text-ink-secondary text-[13px] font-medium"
            >
              Escribe {CONFIRM_WORD} para confirmar
            </label>
            <input
              id="confirmRestore"
              value={confirmText}
              autoComplete="off"
              onChange={(event) => setConfirmText(event.target.value)}
              className="field code h-9 px-3 tracking-[0.1em]"
            />
          </div>
          {error && (
            <p
              role="alert"
              className="border-danger-line bg-danger-surface text-danger rounded-lg border px-3.5 py-2.5 text-sm"
            >
              {error}
            </p>
          )}
          <div className="flex justify-between gap-3">
            <Button
              variant="ghost"
              disabled={isRestoring}
              onClick={() => {
                setSelected(null);
                setConfirmText('');
                setError(null);
              }}
            >
              Volver
            </Button>
            <Button
              variant="danger"
              disabled={confirmText.trim() !== CONFIRM_WORD || isRestoring}
              onClick={() => void restore()}
            >
              {isRestoring ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArchiveRestore />
              )}
              {isRestoring ? 'Restaurando…' : 'Restaurar este respaldo'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Respaldos"
      description="Se hacen solos mientras Opera está abierta (como máximo uno por día) y se guardan 30 días."
      size="lg"
      onClose={onClose}
    >
      {backups === null ? (
        <div className="text-ink-muted flex items-center justify-center gap-2 py-10 text-sm">
          <Loader2 className="text-accent h-4 w-4 animate-spin" />
          Buscando respaldos…
        </div>
      ) : backups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="border-line bg-chrome text-ink-faint flex h-11 w-11 items-center justify-center rounded-xl border">
            <Database className="h-5 w-5" />
          </div>
          <p className="text-ink text-sm font-medium">
            Todavía no hay respaldos.
          </p>
          <p className="text-ink-muted max-w-sm text-[13px]">
            El primero se hace solo unas horas después de abrir Opera.
          </p>
        </div>
      ) : (
        <ul className="border-line divide-line divide-y overflow-hidden rounded-xl border">
          {backups.map((backup, index) => (
            <li
              key={backup.name}
              className="hover:bg-chrome/60 flex items-center justify-between gap-4 px-4 py-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Database className="text-ink-faint h-4 w-4 shrink-0" />
                <div>
                  <p className="text-ink text-sm font-medium">
                    {formatDateTime(backup.createdAt)}
                    {index === 0 && (
                      <span className="text-success ml-2 text-xs font-medium">
                        más reciente
                      </span>
                    )}
                  </p>
                  <p className="figures text-ink-faint text-xs">
                    {formatSize(backup.sizeBytes)}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelected(backup)}
              >
                <ArchiveRestore />
                Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
