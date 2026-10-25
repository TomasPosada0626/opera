import type { ReactNode } from 'react';

export type BadgeVariant =
  'success' | 'warning' | 'danger' | 'accent' | 'neutral';

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  // Punto de color delante del texto — para estados que se escanean en una
  // columna (pedidos, pagos), donde el punto se lee antes que la palabra.
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-surface border-success-line text-success',
  warning: 'bg-warning-surface border-warning-line text-warning',
  danger: 'bg-danger-surface border-danger-line text-danger',
  accent: 'bg-accent-surface border-accent-line text-accent',
  neutral: 'bg-chrome-strong border-line-strong text-ink-secondary',
};

const dotClasses: Record<BadgeVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
  neutral: 'bg-ink-faint',
};

// Pill con fondo tenue + borde del mismo tono + texto saturado — nunca
// texto de color suelto sin fondo (#85). Los nombres son genéricos
// (success/warning/danger/accent/neutral), no del dominio — el consumidor
// mapea su propio estado al tono (ver lib/order-status.ts).
export function Badge({
  variant,
  children,
  dot = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${variantClasses[variant]} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${dotClasses[variant]}`}
        />
      )}
      {children}
    </span>
  );
}
