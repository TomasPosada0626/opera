import { ChevronRight, Mail, Phone } from 'lucide-react';
import { Link } from 'react-router';

interface Party {
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
}

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
  return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
}

// Celdas compartidas por los listados de clientes y proveedores: el nombre
// es el enlace al detalle (antes había que buscar "Ver detalle" al final
// de la fila) y el NIT va debajo, sin partirse en dos líneas.
export function PartyNameCell({ party, to }: { party: Party; to: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3">
      <span
        aria-hidden="true"
        className="border-line bg-chrome text-ink-secondary group-hover:border-accent-line group-hover:text-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold uppercase transition-colors"
      >
        {initials(party.name)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-ink group-hover:text-accent truncate font-medium transition-colors">
          {party.name}
        </span>
        <span className="text-ink-faint text-xs whitespace-nowrap">
          {party.taxId ? (
            <>
              NIT <span className="figures">{party.taxId}</span>
            </>
          ) : (
            'Sin NIT'
          )}
        </span>
      </span>
    </Link>
  );
}

export function PartyContactCell({ party }: { party: Party }) {
  if (!party.email && !party.phone) {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-[13px]">
      {party.email && (
        <span className="text-ink-secondary flex items-center gap-1.5 truncate">
          <Mail className="text-ink-faint h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{party.email}</span>
        </span>
      )}
      {party.phone && (
        <span className="text-ink-muted flex items-center gap-1.5 whitespace-nowrap">
          <Phone className="text-ink-faint h-3.5 w-3.5 shrink-0" />
          <span className="figures">{party.phone}</span>
        </span>
      )}
    </div>
  );
}

export function PartyDetailLink({ name, to }: { name: string; to: string }) {
  return (
    <Link
      to={to}
      aria-label={`Ver detalle de ${name}`}
      className="text-ink-faint hover:text-ink hover:bg-chrome-strong focus-visible:ring-accent inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
    >
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}
