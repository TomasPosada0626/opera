import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

// Primitivo base del sistema de diseño (#85) — bordes translúcidos, no
// sólidos, y fondo elevado sobre la superficie de la página. El gradiente
// específico de las tarjetas KPI llega junto con KPICard, cuando exista un
// endpoint real de agregados que las alimente (M5, #75).
export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-surface-raised border-line rounded-xl border p-6 shadow-md shadow-black/[0.06] dark:shadow-black/50 ${className}`}
    >
      {children}
    </div>
  );
}
