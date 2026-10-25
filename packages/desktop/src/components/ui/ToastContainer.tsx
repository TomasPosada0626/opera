import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';
import { toast, useToasts, type ToastVariant } from '../../lib/toast';

// Fondo sólido (no el tono translúcido de los Badge): un toast flota sobre
// contenido arbitrario y con fondo al 10% el texto de abajo se leía a
// través. El color va en el ícono y en la barra lateral.
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'text-success shadow-[inset_3px_0_0_var(--color-success)]',
  danger: 'text-danger shadow-[inset_3px_0_0_var(--color-danger)]',
  warning: 'text-warning shadow-[inset_3px_0_0_var(--color-warning)]',
};

const VARIANT_ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
};

// role="status" + aria-live en el contenedor (no por toast): un lector de
// pantalla anuncia cada mensaje nuevo a medida que se agrega al DOM, sin
// duplicar el anuncio por tener múltiples regiones live simultáneas.
export function ToastContainer() {
  const toasts = useToasts();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-40 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((item) => {
        const Icon = VARIANT_ICONS[item.variant];
        return (
          <div
            key={item.id}
            className={`animate-slide-in bg-surface-raised border-line-strong flex items-start gap-3 overflow-hidden rounded-xl border py-3 pr-3 pl-4 shadow-xl shadow-black/15 dark:shadow-black/60 ${VARIANT_CLASSES[item.variant]}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <p className="text-ink flex-1 text-sm leading-5">{item.message}</p>
            <button
              type="button"
              onClick={() => toast.dismiss(item.id)}
              aria-label="Cerrar notificación"
              className="text-ink-muted hover:text-ink shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
