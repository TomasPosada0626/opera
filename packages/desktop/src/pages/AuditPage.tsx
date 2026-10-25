import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { useAuditLog } from '../hooks/useAuditLog';
import {
  AUDIT_ENTITY_LABEL,
  auditActionLabel,
  auditEntityLabel,
} from '../lib/audit-labels';
import { formatDateTime } from '../lib/format';
import type { AuditEntry } from '../types/audit';

const PAGE_SIZE = 25;

// El backend trata `to` como exclusivo, igual que en Reportes.
function nextDayIso(date: string): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  const json = JSON.stringify(value) ?? '';
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}

// Solo los campos que cambiaron entre before y after — el registro guarda
// la entidad completa, pero lo que interesa leer es la diferencia.
function changedFields(entry: AuditEntry) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter(
      (key) =>
        !['updatedAt', 'createdAt'].includes(key) &&
        JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    )
    .map((key) => ({ key, before: before[key], after: after[key] }));
}

function ChangesDetail({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const changes = changedFields(entry);
  if (changes.length === 0) {
    return <span className="text-ink-faint text-xs">—</span>;
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-ink-muted hover:text-ink inline-flex items-center gap-1 text-[13px] font-medium transition-colors"
      >
        {changes.length === 1 ? '1 campo' : `${changes.length} campos`}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <dl className="border-line bg-chrome/60 animate-fade-in w-[420px] rounded-lg border p-3 text-left text-xs">
          {changes.map((change) => (
            <div
              key={change.key}
              className="border-line grid grid-cols-[110px_1fr] gap-2 border-b py-1.5 last:border-b-0"
            >
              <dt className="text-ink-muted figures">{change.key}</dt>
              <dd className="flex flex-col gap-0.5">
                {entry.before && (
                  <span className="text-danger line-through decoration-1">
                    {displayValue(change.before)}
                  </span>
                )}
                <span className="text-success">
                  {displayValue(change.after)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// Registro de auditoría completo (GET /audit): cada mutación relevante
// con quién, cuándo y qué cambió. Antes existía en la base pero no había
// pantalla para leerlo.
function AuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const auditQuery = useAuditLog({
    page,
    pageSize: PAGE_SIZE,
    entity: entity || undefined,
    from: from || undefined,
    to: to ? nextDayIso(to) : undefined,
  });

  const columns: DataTableColumn<AuditEntry>[] = [
    {
      key: 'when',
      header: 'Cuándo',
      className: 'whitespace-nowrap text-ink-muted',
      render: (entry) => formatDateTime(entry.timestamp),
    },
    {
      key: 'what',
      header: 'Qué pasó',
      render: (entry) => (
        <p className="text-[13px]">
          <span className="text-ink font-medium">{entry.user.name}</span>{' '}
          <span className="text-ink-secondary">
            {auditActionLabel(entry.action)}{' '}
            {auditEntityLabel(entry.entity).toLowerCase()}
          </span>
        </p>
      ),
    },
    {
      key: 'entity',
      header: 'Registro',
      render: (entry) => (
        <span className="figures text-ink-faint text-xs">
          {entry.entityId.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'changes',
      header: 'Cambios',
      className: 'text-right',
      render: (entry) => <ChangesDetail entry={entry} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Configuración"
        title="Auditoría"
        description="Cada cambio relevante del sistema, con quién lo hizo y qué valores tenía antes y después. Es de solo lectura: nadie puede editar ni borrar este registro."
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs font-medium">Tipo</span>
          <select
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value);
              setPage(1);
            }}
            className="field h-8 px-3"
          >
            <option value="">Todos</option>
            {Object.entries(AUDIT_ENTITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs font-medium">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="field h-8 px-3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs font-medium">Hasta</span>
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="field h-8 px-3"
          />
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={auditQuery.data?.data ?? []}
        rowKey={(entry) => entry.id}
        isLoading={auditQuery.isLoading}
        emptyMessage="No hay registros para estos filtros."
      />

      {auditQuery.data && (
        <Pagination
          page={auditQuery.data.meta.page}
          totalPages={auditQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export default AuditPage;
