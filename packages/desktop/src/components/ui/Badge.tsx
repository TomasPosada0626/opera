import type { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger';

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-surface border-success-line text-success',
  warning: 'bg-warning-surface border-warning-line text-warning',
  danger: 'bg-danger-surface border-danger-line text-danger',
};

// Pill con fondo tenue + borde del mismo tono + texto saturado — nunca
// texto de color suelto sin fondo (#85). Los nombres son genéricos
// (success/warning/danger), no del dominio ("liquidada"/"pendiente") — el
// consumidor (p. ej. la tabla de remisiones en M5) mapea su propio estado
// al tono correspondiente vía `children`, no vía el nombre de la variante.
export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
