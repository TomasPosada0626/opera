import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Overlay + panel simple: cierre con Escape o click en el backdrop, mismo
// patrón manual que UserMenu (#41) en vez de una librería de diálogos para
// un solo caso de uso.
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface-raised w-full max-w-md rounded-xl border p-6 shadow-xl shadow-black/20 dark:shadow-black/60"
      >
        <div className="border-line mb-4 flex items-center justify-between border-b pb-4">
          <h2 className="text-ink text-lg font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-muted hover:text-ink hover:bg-chrome-strong rounded-md p-1 transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
