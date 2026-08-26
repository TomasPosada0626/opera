import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import ReportsPage from './ReportsPage';
import { apiFetch } from '../lib/api-client';
import { downloadFile } from '../lib/download-file';
import type {
  InventoryReportRow,
  SalesReport,
  TopProductRow,
} from '../types/report';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock('../lib/download-file', () => ({
  downloadFile: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;
const mockedDownloadFile = downloadFile as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const salesReport: SalesReport = {
  from: null,
  to: null,
  orderCount: 4,
  totalQuantity: '12',
  totalRevenue: '600',
};

// product-1 aparece en ambos reportes a propósito (mismo producto, dos
// vistas distintas) — los tests que dependen de un texto único anclan en
// "Mesa de centro" (solo en el ranking) en vez de "Silla de madera" (en
// ambas tablas), para no depender de cuál tabla renderiza primero.
const topProducts: TopProductRow[] = [
  {
    productId: 'product-1',
    sku: 'PT-1',
    name: 'Silla de madera',
    quantitySold: '8',
    revenue: '400',
  },
  {
    productId: 'product-2',
    sku: 'PT-2',
    name: 'Mesa de centro',
    quantitySold: '4',
    revenue: '200',
  },
];

const inventoryRows: InventoryReportRow[] = [
  {
    id: 'product-1',
    sku: 'PT-1',
    name: 'Silla de madera',
    category: 'Muebles',
    unit: 'Unidad',
    stock: '15',
    averageCost: '20',
    stockValue: '300',
  },
];

function mockReportEndpoints() {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/reports/inventario')) {
      return Promise.resolve(inventoryRows);
    }
    if (path.startsWith('/reports/ventas')) {
      return Promise.resolve(salesReport);
    }
    if (path.startsWith('/reports/productos-mas-vendidos')) {
      return Promise.resolve(topProducts);
    }
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

// getAllByText, no getByText: "Ingresos" también es el encabezado de la
// columna de la tabla de ranking más abajo — el tile siempre es la primera
// coincidencia porque la sección de Ventas precede a esa tabla en el DOM.
function statTileValue(label: string): string | null | undefined {
  const [labelNode] = screen.getAllByText(label);
  return labelNode.nextElementSibling?.textContent;
}

describe('ReportsPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedDownloadFile.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the sales stat tiles from /reports/ventas', async () => {
    mockReportEndpoints();

    renderWithClient(<ReportsPage />);
    await screen.findByText('600,00');

    expect(statTileValue('Pedidos')).toBe('4');
    expect(statTileValue('Unidades vendidas')).toBe('12');
    expect(statTileValue('Ingresos')).toBe('600,00');
  });

  it('ranks products with the most sold first by default', async () => {
    mockReportEndpoints();

    renderWithClient(<ReportsPage />);
    await screen.findByText(/Mesa de centro/);

    const [topProductsTable] = screen.getAllByRole('table');
    const rows = within(topProductsTable).getAllByRole('row');
    expect(within(rows[1]).getByText(/Silla de madera/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Mesa de centro/)).toBeInTheDocument();
  });

  it('re-queries with sortOrder=asc when "Menos vendidos" is clicked', async () => {
    mockReportEndpoints();

    renderWithClient(<ReportsPage />);
    await screen.findByText(/Mesa de centro/);

    screen.getByRole('button', { name: 'Menos vendidos' }).click();

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('sortOrder=asc'),
      );
    });
  });

  it('renders the inventory table with its total value', async () => {
    mockReportEndpoints();

    renderWithClient(<ReportsPage />);

    expect(await screen.findByText('Valor total: 300,00')).toBeInTheDocument();
    expect(screen.getByText('Muebles')).toBeInTheDocument();
    expect(screen.getByText('20,00')).toBeInTheDocument();
  });

  it('downloads the sales report as .xlsx with the current date filters', async () => {
    mockReportEndpoints();

    renderWithClient(<ReportsPage />);
    await screen.findByText('600,00');

    const [salesExportButton] = screen.getAllByRole('button', {
      name: 'Exportar a Excel',
    });
    salesExportButton.click();

    expect(mockedDownloadFile).toHaveBeenCalledWith(
      '/reports/ventas/excel',
      'ventas.xlsx',
    );
  });

  it('downloads the top-products report as .xlsx honoring the current sort order', async () => {
    mockReportEndpoints();

    renderWithClient(<ReportsPage />);
    await screen.findByText(/Mesa de centro/);

    screen.getByRole('button', { name: 'Menos vendidos' }).click();
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('sortOrder=asc'),
      );
    });

    const [, topProductsExportButton] = screen.getAllByRole('button', {
      name: 'Exportar a Excel',
    });
    topProductsExportButton.click();

    expect(mockedDownloadFile).toHaveBeenCalledWith(
      '/reports/productos-mas-vendidos/excel?sortOrder=asc',
      'productos-mas-vendidos.xlsx',
    );
  });

  it('downloads the inventory report as .xlsx', async () => {
    mockReportEndpoints();

    renderWithClient(<ReportsPage />);
    await screen.findByText('Valor total: 300,00');

    const [, , inventoryExportButton] = screen.getAllByRole('button', {
      name: 'Exportar a Excel',
    });
    inventoryExportButton.click();

    expect(mockedDownloadFile).toHaveBeenCalledWith(
      '/reports/inventario/excel',
      'inventario.xlsx',
    );
  });
});
