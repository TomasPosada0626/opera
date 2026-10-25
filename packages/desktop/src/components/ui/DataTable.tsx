import type { ReactNode } from 'react';
import { Inbox, Loader2 } from 'lucide-react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  // Texto secundario del estado vacío ("Crea el primero con «Nuevo pedido»").
  emptyHint?: string;
  // Resalta filas que necesitan atención (p. ej. pedidos atrasados) con
  // una barra de color a la izquierda, sin teñir la fila completa.
  rowTone?: (row: T) => 'danger' | 'warning' | undefined;
}

const toneClasses = {
  danger: 'shadow-[inset_3px_0_0_var(--color-danger)]',
  warning: 'shadow-[inset_3px_0_0_var(--color-warning)]',
};

// Primitivo de listado (#42, sistema de diseño #85, refinado tras feedback
// visual): encabezados en tono terciario sobre un fondo levemente distinto
// para separarlos del cuerpo, sin franjas alternadas por fila (compiten con
// el contenido en vez de organizarlo). `bg-surface-raised` + sombra le dan
// elevación real — sin fondo propio, la tabla anterior quedaba invisible
// contra la página.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyMessage = 'Sin resultados.',
  emptyHint,
  rowTone,
}: DataTableProps<T>) {
  return (
    <div className="border-line bg-surface-raised overflow-hidden rounded-xl border shadow-sm shadow-black/[0.04] dark:shadow-black/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-line bg-chrome border-b">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`text-ink-muted px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14">
                  <div className="text-ink-muted flex flex-col items-center gap-2 text-sm">
                    <Loader2 className="text-accent h-5 w-5 animate-spin" />
                    Cargando…
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="border-line bg-chrome text-ink-faint flex h-11 w-11 items-center justify-center rounded-xl border">
                      <Inbox className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-ink text-sm font-medium">
                        {emptyMessage}
                      </p>
                      {emptyHint && (
                        <p className="text-ink-muted mt-0.5 text-[13px]">
                          {emptyHint}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const tone = rowTone?.(row);
                return (
                  <tr
                    key={rowKey(row)}
                    className={`border-line hover:bg-chrome/70 border-b transition-colors duration-150 last:border-b-0 ${tone ? toneClasses[tone] : ''}`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`text-ink px-4 py-3 align-middle ${column.className ?? ''}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
