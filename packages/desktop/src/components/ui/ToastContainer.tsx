import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';
import { toast, useToasts, type ToastVariant } from '../../lib/toast';

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-success-surface border-success-line text-success',
  danger: 'bg-danger-surface border-danger-line text-danger',
  warning: 'bg-warning-surface border-warning-line text-warning',
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
            className={`flex items-start gap-3 rounded-lg border p-3 shadow-lg shadow-black/10 dark:shadow-black/40 ${VARIANT_CLASSES[item.variant]}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <p className="text-ink flex-1 text-sm">{item.message}</p>
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
