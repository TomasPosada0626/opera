import { useEffect, useRef, useState } from 'react';
import { Database, Download, KeyRound, LogOut } from 'lucide-react';
import type { CurrentUser } from '../../lib/current-user';
import { toast } from '../../lib/toast';
import { RecoveryCodeModal } from '../auth/RecoveryCodeModal';
import { BackupsModal } from './BackupsModal';

interface UserMenuProps {
  user: CurrentUser | null;
  onLogout: () => void;
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

// El backup automático (backend-manager.ts, runBackupIfDue) corría en
// silencio, sin ningún indicador para quien usa la app -- si fallaba
// repetidamente, nadie se enteraba hasta el día de necesitar restaurar y no
// haber nada útil (auditoría 2026-09-06, ronda 5, Documentación/
// Observabilidad). Texto informativo nada más, sin acción -- no hay ningún
// botón de "reintentar ahora", el intervalo de 6 horas ya se encarga solo.
function backupStatusText(status: BackupStatus): string {
  if (status.lastAttemptFailed) {
    return status.lastSuccessAt
      ? `El último respaldo falló (el anterior exitoso fue ${formatRelativeDays(status.lastSuccessAt)}).`
      : 'El último respaldo falló y todavía no hay ninguno exitoso.';
  }
  if (!status.lastSuccessAt) {
    return 'Todavía no se hizo ningún respaldo automático.';
  }
  return `Último respaldo exitoso: ${formatRelativeDays(status.lastSuccessAt)}.`;
}

function formatRelativeDays(isoDate: string): string {
  const days = Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) {
    return 'hoy';
  }
  if (days === 1) {
    return 'ayer';
  }
  return `hace ${days} días`;
}

// Menú de usuario con logout (#41) — sin librería de dropdown: solo un
// click-outside + Escape hechos a mano, suficiente para un solo consumidor.
export function UserMenu({ user, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  // Los diálogos viven fuera del desplegable: cerrar el menú no debe
  // desmontar un modal abierto desde él.
  const [dialog, setDialog] = useState<'recovery' | 'backups' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleExportLogs() {
    if (!window.appLogs) {
      return;
    }
    const result = await window.appLogs.export();
    if (result.ok) {
      setExportMessage(`Guardado en ${result.path}`);
    } else if (result.reason === 'no-logs') {
      setExportMessage('No hay errores registrados todavía.');
    } else if (result.reason !== 'canceled') {
      setExportMessage('No se pudo exportar el registro.');
    }
  }

  useEffect(() => {
    if (open && window.appBackend) {
      void window.appBackend.getBackupStatus().then(setBackupStatus);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  if (!user) {
    return null;
  }

  function openDialog(next: 'recovery' | 'backups') {
    setOpen(false);
    setDialog(next);
  }

  const itemClassName =
    'text-ink hover:bg-chrome-strong focus-visible:ring-accent flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] outline-none transition-colors focus-visible:ring-2';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bg-accent text-on-accent focus-visible:ring-accent focus-visible:ring-offset-chrome ease-snappy flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition-all duration-200 outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
      >
        {initials(user.email)}
      </button>

      {open && (
        <div
          role="menu"
          className="border-line bg-surface-raised animate-pop-in absolute right-0 z-30 mt-2 w-72 rounded-xl border p-1.5 shadow-2xl shadow-black/15 dark:shadow-black/60"
        >
          <div className="border-line mb-1 border-b px-3 pt-2 pb-3">
            <p className="text-ink truncate text-sm font-medium">
              {user.email}
            </p>
            <p className="text-ink-faint text-xs">
              {user.roles.length > 0
                ? user.roles.join(', ')
                : 'Sin rol asignado'}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => openDialog('recovery')}
            className={itemClassName}
          >
            <KeyRound className="text-ink-muted h-4 w-4" />
            Código de recuperación
          </button>
          {window.appBackend && (
            <button
              type="button"
              role="menuitem"
              onClick={() => openDialog('backups')}
              className={itemClassName}
            >
              <Database className="text-ink-muted h-4 w-4" />
              Respaldos
            </button>
          )}
          {window.appLogs && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportLogs()}
              className={itemClassName}
            >
              <Download className="text-ink-muted h-4 w-4" />
              Exportar registro de errores
            </button>
          )}
          {exportMessage && (
            <p className="text-ink-muted px-3 pt-1 text-xs">{exportMessage}</p>
          )}
          {backupStatus && (
            <p
              className={
                backupStatus.lastAttemptFailed
                  ? 'text-danger px-3 pt-1 text-xs'
                  : 'text-ink-muted px-3 pt-1 text-xs'
              }
            >
              {backupStatusText(backupStatus)}
            </p>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className={itemClassName}
          >
            <LogOut className="text-ink-muted h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}

      {dialog === 'recovery' && (
        <RecoveryCodeModal onClose={() => setDialog(null)} />
      )}
      {dialog === 'backups' && (
        <BackupsModal
          onClose={() => setDialog(null)}
          onRestored={() => {
            setDialog(null);
            toast.success(
              'Respaldo restaurado. Inicia sesión de nuevo para seguir.',
            );
            onLogout();
          }}
        />
      )}
    </div>
  );
}
