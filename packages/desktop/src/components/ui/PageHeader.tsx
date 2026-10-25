import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

interface PageHeaderProps {
  title: ReactNode;
  // Módulo al que pertenece la pantalla ("Ventas", "Inventario") — ubica
  // a quien llega desde la búsqueda global sin pasar por el menú.
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  // Para pantallas de detalle: el enlace de vuelta a su listado.
  back?: { to: string; label: string };
  // Fila de datos clave bajo el título (estado, fechas, totales).
  meta?: ReactNode;
}

// Encabezado común de todas las pantallas: misma jerarquía en todas
// (eyebrow tenue -> título grande y apretado -> descripción), en vez de un
// <h1> armado a mano distinto en cada página.
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  back,
  meta,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link
          to={back.to}
          className="text-ink-muted hover:text-ink focus-visible:ring-accent group inline-flex w-fit items-center gap-1.5 rounded-md text-[13px] font-medium transition-colors outline-none focus-visible:ring-2"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-accent mb-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="text-ink text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            {title}
          </h1>
          {description && (
            <p className="text-ink-muted mt-1.5 max-w-2xl text-sm">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {meta && (
        <div className="text-ink-muted flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          {meta}
        </div>
      )}
    </header>
  );
}
