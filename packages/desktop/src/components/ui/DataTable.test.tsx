import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Nombre', render: (row) => row.name },
];

describe('DataTable', () => {
  it('renders a header and a row per item', () => {
    render(
      <DataTable
        columns={columns}
        rows={[
          { id: '1', name: 'Producto A' },
          { id: '2', name: 'Producto B' },
        ]}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Producto A')).toBeInTheDocument();
    expect(screen.getByText('Producto B')).toBeInTheDocument();
  });

  it('shows the loading state instead of the rows while isLoading is true', () => {
    render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', name: 'Producto A' }]}
        rowKey={(row) => row.id}
        isLoading
      />,
    );

    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    expect(screen.queryByText('Producto A')).not.toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        emptyMessage="No hay productos"
      />,
    );

    expect(screen.getByText('No hay productos')).toBeInTheDocument();
  });
});
