import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

// Enlace al detalle al final de una fila: solo el ícono (el texto "Ver
// detalle" en cada fila empujaba las tablas anchas fuera de la pantalla),
// con el nombre completo para lectores de pantalla.
export function DetailLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="text-ink-faint hover:text-accent hover:bg-accent-surface focus-visible:ring-accent inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
    >
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}
