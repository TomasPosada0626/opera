import { useEffect, useRef, useState } from 'react';
import { Download, LogOut } from 'lucide-react';
import type { CurrentUser } from '../../lib/current-user';

interface UserMenuProps {
  user: CurrentUser | null;
  onLogout: () => void;
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

// Menú de usuario con logout (#41) — sin librería de dropdown: solo un
// click-outside + Escape hechos a mano, suficiente para un solo consumidor.
export function UserMenu({ user, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bg-accent text-on-accent focus-visible:ring-accent focus-visible:ring-offset-chrome flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {initials(user.email)}
      </button>

      {open && (
        <div
          role="menu"
          className="border-line bg-surface-raised absolute right-0 z-20 mt-2 w-56 rounded-lg border p-1 shadow-xl shadow-black/10 dark:shadow-black/60"
        >
          <div className="border-line border-b px-3 py-2">
            <p className="text-ink truncate text-sm font-medium">
              {user.email}
            </p>
            <p className="text-ink-faint text-xs">
              {user.roles.length > 0
                ? user.roles.join(', ')
                : 'Sin rol asignado'}
            </p>
          </div>
          {window.appLogs && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportLogs()}
              className="text-ink hover:bg-surface focus-visible:ring-accent mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2"
            >
              <Download className="h-4 w-4" />
              Exportar registro de errores
            </button>
          )}
          {exportMessage && (
            <p className="text-ink-muted px-3 pt-1 text-xs">{exportMessage}</p>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="text-ink hover:bg-surface focus-visible:ring-accent mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
