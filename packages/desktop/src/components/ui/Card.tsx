import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  // Tarjeta que se puede tocar (envuelta en un Link o con onClick en el
  // padre): eleva el borde y la sombra al pasar el mouse.
  interactive?: boolean;
}

// Primitivo base del sistema de diseño (#85) — bordes translúcidos, no
// sólidos, y fondo elevado sobre la superficie de la página.
export function Card({
  children,
  className = '',
  interactive = false,
}: CardProps) {
  return (
    <div
      className={`bg-surface-raised border-line rounded-xl border p-6 shadow-sm shadow-black/[0.04] dark:shadow-black/40 ${
        interactive
          ? 'ease-snappy hover:border-line-strong transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.07] dark:hover:shadow-black/60'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

// Encabezado estándar de una sección dentro de una Card — título corto,
// línea de contexto opcional y una acción alineada a la derecha.
export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-ink text-[15px] font-semibold tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-ink-muted mt-0.5 text-[13px]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
