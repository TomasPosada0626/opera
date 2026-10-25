import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalSize = 'md' | 'lg' | 'xl';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Línea de contexto bajo el título ("Pedido No. 45 — Ferretería Sur").
  description?: string;
  size?: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Overlay + panel simple: cierre con Escape o click en el backdrop, mismo
// patrón manual que UserMenu (#41) en vez de una librería de diálogos para
// un solo caso de uso. Foco atrapado dentro del panel mientras está abierto
// (Tab/Shift+Tab no se escapan al fondo) y devuelto a quien abrió el modal
// al cerrarlo — sin esto, un usuario de teclado podía tabular "a través"
// del modal hacia botones tapados detrás de él. El cuerpo hace scroll
// propio (max-h) con el encabezado fijo: un pedido con muchas líneas o una
// lista de materiales larga ya no se sale de la ventana.
export function Modal({
  title,
  onClose,
  children,
  description,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }
      const focusable =
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  return (
    <div
      role="presentation"
      className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      {/* onClick acá solo corta la propagación hacia el backdrop — no agrega
          ninguna interacción nueva que un usuario de teclado necesite
          replicar. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`animate-pop-in border-line bg-surface-raised flex max-h-[88vh] w-full flex-col rounded-2xl border shadow-2xl shadow-black/25 outline-none dark:shadow-black/70 ${sizeClasses[size]}`}
      >
        <div className="border-line flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-ink text-base font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p className="text-ink-muted mt-0.5 truncate text-[13px]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-muted hover:text-ink hover:bg-chrome-strong focus-visible:ring-accent -mr-1.5 rounded-lg p-1.5 transition-colors outline-none focus-visible:ring-2"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
