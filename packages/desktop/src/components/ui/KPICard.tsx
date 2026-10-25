import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from './Card';

type KPICardVariant = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  variant?: KPICardVariant;
  // Una línea de contexto bajo el número ("3 remisiones", "desde el 2 oct").
  hint?: string;
  // Valor exacto cuando `value` va abreviado (ej. "$ 1,2 M").
  title?: string;
  // A dónde lleva el KPI: un número que se puede investigar es más útil
  // que uno que solo se mira.
  to?: string;
}

const iconClasses: Record<KPICardVariant, string> = {
  accent: 'bg-accent-surface border-accent-line text-accent',
  success: 'bg-success-surface border-success-line text-success',
  warning: 'bg-warning-surface border-warning-line text-warning',
  danger: 'bg-danger-surface border-danger-line text-danger',
  neutral: 'bg-chrome-strong border-line-strong text-ink-secondary',
};

// La cifra manda: grande, en Geist Mono con dígitos tabulares, y la
// etiqueta queda en segundo plano (pequeña, mayúsculas, color tenue).
export function KPICard({
  icon: Icon,
  label,
  value,
  variant = 'accent',
  hint,
  title,
  to,
}: KPICardProps) {
  const body = (
    <Card
      interactive={!!to}
      className="group relative flex h-full flex-col gap-4 p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
          {label}
        </span>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconClasses[variant]}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span
          title={title}
          className="figures text-ink text-[26px] leading-none font-semibold"
        >
          {value}
        </span>
        {hint && <span className="text-ink-muted text-xs">{hint}</span>}
      </div>
      {to && (
        <ArrowUpRight
          aria-hidden="true"
          className="text-ink-faint group-hover:text-ink absolute right-4 bottom-4 h-4 w-4 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      )}
    </Card>
  );

  if (!to) {
    return body;
  }
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value}`}
      className="focus-visible:ring-accent focus-visible:ring-offset-surface block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {body}
    </Link>
  );
}
