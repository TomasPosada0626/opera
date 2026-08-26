import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';

type KPICardVariant = 'accent' | 'success' | 'warning' | 'danger';

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  variant?: KPICardVariant;
}

const variantClasses: Record<KPICardVariant, string> = {
  accent: 'bg-accent-surface border-accent-line text-accent',
  success: 'bg-success-surface border-success-line text-success',
  warning: 'bg-warning-surface border-warning-line text-warning',
  danger: 'bg-danger-surface border-danger-line text-danger',
};

// Primitivo pendiente desde el sistema de diseño (#85): un ícono en un
// círculo con fondo tenue del tono correspondiente (mismo patrón de
// fondo-tenue + borde-del-mismo-tono que Badge, no un color suelto) junto a
// la etiqueta/valor — para la pantalla de inicio (#76), la primera con
// datos agregados reales que lo necesitan.
export function KPICard({
  icon: Icon,
  label,
  value,
  variant = 'accent',
}: KPICardProps) {
  return (
    <Card className="flex items-center gap-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${variantClasses[variant]}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-ink-muted text-sm font-medium">{label}</span>
        <span className="text-ink text-xl font-semibold">{value}</span>
      </div>
    </Card>
  );
}
