import type { ReactNode } from 'react';

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

// Primitivo de listado (#42, sistema de diseño #85): encabezados en tono
// terciario (ink-muted) y bordes de fila translúcidos, sin franjas
// alternadas — el brief de diseño las descarta explícitamente porque
// compiten visualmente con el contenido en vez de organizarlo.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyMessage = 'Sin resultados.',
}: DataTableProps<T>) {
  return (
    <div className="border-line overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-line border-b">
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
              <td
                colSpan={columns.length}
                className="text-ink-muted px-4 py-6 text-center"
              >
                Cargando…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-ink-muted px-4 py-6 text-center"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-line border-b last:border-b-0"
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
  );
}
