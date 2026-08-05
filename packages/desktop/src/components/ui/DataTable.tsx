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
}

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
}: DataTableProps<T>) {
  return (
    <div className="border-line bg-surface-raised overflow-hidden rounded-xl border shadow-sm shadow-black/5 dark:shadow-black/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-line bg-chrome-strong border-b">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`text-ink-muted px-4 py-3 text-xs font-medium tracking-wide uppercase ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10">
                  <div className="text-ink-muted flex flex-col items-center gap-2 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Cargando…
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10">
                  <div className="text-ink-muted flex flex-col items-center gap-2 text-sm">
                    <Inbox className="h-5 w-5" />
                    {emptyMessage}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-line hover:bg-chrome/60 border-b transition-colors last:border-b-0"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`text-ink px-4 py-3 ${column.className ?? ''}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
