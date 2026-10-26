import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  ReceivablesRow,
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

function renderAt(path = '/reportes') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ReportsPage />
      </MemoryRouter>
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

const receivables: ReceivablesRow[] = [
  {
    customerId: 'customer-1',
    customerName: 'Ferretería Sur',
    remissionCount: 2,
    totalBilled: '150',
    totalPaid: '40',
    balance: '110',
    oldestPendingAt: '2026-08-01T00:00:00.000Z',
    daysPending: 75,
  },
  {
    customerId: 'customer-2',
    customerName: 'Obras Norte',
    remissionCount: 1,
    totalBilled: '50',
    totalPaid: '0',
    balance: '50',
    oldestPendingAt: '2026-10-10T00:00:00.000Z',
    daysPending: 35,
  },
];

const payables = [
  {
    supplierId: 'supplier-1',
    supplierName: 'Aceros de Colombia S.A.',
    purchaseOrderCount: 2,
    totalReceived: '7500',
    totalPaid: '5000',
    balance: '2500',
    oldestPendingAt: '2026-10-10T00:00:00.000Z',
    daysPending: 15,
  },
];

function mockReportEndpoints() {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/reports/cartera')) {
      return Promise.resolve(receivables);
    }
    if (path.startsWith('/reports/por-pagar')) {
      return Promise.resolve(payables);
    }
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

describe('ReportsPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedDownloadFile.mockReset();
    mockReportEndpoints();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cartera (vista por defecto)', () => {
    it('lists who owes what, biggest balance first, with the age of the oldest pending remission', async () => {
      renderAt();

      await screen.findByText('Ferretería Sur');
      const rows = within(screen.getByRole('table')).getAllByRole('row');
      expect(within(rows[1]).getByText('Ferretería Sur')).toHaveAttribute(
        'href',
        '/clientes/customer-1',
      );
      expect(within(rows[1]).getByText('75 días')).toBeInTheDocument();
      expect(within(rows[2]).getByText('35 días')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Cartera/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('summarizes the total receivable and the customers involved', async () => {
      renderAt();

      expect(await screen.findByText('Clientes con saldo')).toBeInTheDocument();
      // Una vez en el KPI de antigüedad y otra en la fila del cliente.
      expect(await screen.findAllByText('75 días')).toHaveLength(2);
    });

    it('exports the receivables report', async () => {
      const user = userEvent.setup();
      renderAt();

      await screen.findByText('Ferretería Sur');
      await user.click(
        screen.getByRole('button', { name: /Exportar a Excel/ }),
      );

      expect(mockedDownloadFile).toHaveBeenCalledWith(
        '/reports/cartera/excel',
        'cartera.xlsx',
      );
    });
  });

  describe('Por pagar', () => {
    it('lists what is owed to each supplier and exports it', async () => {
      const user = userEvent.setup();
      renderAt('/reportes?vista=por-pagar');

      expect(
        await screen.findByText('Aceros de Colombia S.A.'),
      ).toHaveAttribute('href', '/proveedores/supplier-1');
      expect(screen.getByText('Proveedores con saldo')).toBeInTheDocument();
      expect(screen.getAllByText('15 días')).toHaveLength(2);

      await user.click(
        screen.getByRole('button', { name: /Exportar a Excel/ }),
      );
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        '/reports/por-pagar/excel',
        'cuentas-por-pagar.xlsx',
      );
    });

    it('says when nothing is owed', async () => {
      mockedApiFetch.mockImplementation((path: string) =>
        path.startsWith('/reports/por-pagar')
          ? Promise.resolve([])
          : Promise.reject(new Error(`unexpected path: ${path}`)),
      );
      renderAt('/reportes?vista=por-pagar');

      expect(
        await screen.findByText('No se le debe nada a ningún proveedor.'),
      ).toBeInTheDocument();
    });
  });

  it('opens the view named in ?vista=', async () => {
    renderAt('/reportes?vista=inventario');

    expect(await screen.findByText('Muebles')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Inventario/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  describe('Ventas', () => {
    it('renders the sales totals', async () => {
      renderAt('/reportes?vista=ventas');

      expect(await screen.findByText(/\$\s?600/)).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('re-queries with the date range, treating "Hasta" as exclusive, and exports with it', async () => {
      const user = userEvent.setup();
      renderAt('/reportes?vista=ventas');
      await screen.findByText(/\$\s?600/);

      await user.type(screen.getByLabelText('Desde'), '2026-08-01');
      await user.type(screen.getByLabelText('Hasta'), '2026-08-15');

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith(
          expect.stringContaining('from=2026-08-01'),
        );
      });
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('to=2026-08-16'),
      );

      await user.click(
        screen.getByRole('button', { name: /Exportar a Excel/ }),
      );
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        '/reports/ventas/excel?from=2026-08-01&to=2026-08-16',
        'ventas.xlsx',
      );
    });

    it('exports without filters when none are set', async () => {
      const user = userEvent.setup();
      renderAt('/reportes?vista=ventas');
      await screen.findByText(/\$\s?600/);

      await user.click(
        screen.getByRole('button', { name: /Exportar a Excel/ }),
      );
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        '/reports/ventas/excel',
        'ventas.xlsx',
      );
    });
  });

  describe('Más vendidos', () => {
    it('ranks products with the most sold first by default', async () => {
      renderAt('/reportes?vista=productos');

      const table = await screen.findByRole('table');
      await within(table).findByText(/Mesa de centro/);
      const rows = within(table).getAllByRole('row');
      expect(within(rows[1]).getByText(/Silla de madera/)).toBeInTheDocument();
      expect(within(rows[2]).getByText(/Mesa de centro/)).toBeInTheDocument();
    });

    it('re-queries and exports with sortOrder=asc after "Menos vendidos"', async () => {
      const user = userEvent.setup();
      renderAt('/reportes?vista=productos');
      await screen.findByText(/Mesa de centro/);

      await user.click(screen.getByRole('button', { name: 'Menos vendidos' }));
      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith(
          expect.stringContaining('sortOrder=asc'),
        );
      });

      await user.click(
        screen.getByRole('button', { name: /Exportar a Excel/ }),
      );
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        '/reports/productos-mas-vendidos/excel?sortOrder=asc',
        'productos-mas-vendidos.xlsx',
      );

      await user.click(screen.getByRole('button', { name: 'Más vendidos' }));
    });
  });

  describe('Inventario', () => {
    it('renders the inventory table with its total value and exports it', async () => {
      const user = userEvent.setup();
      renderAt('/reportes?vista=inventario');

      expect(await screen.findByText('Muebles')).toBeInTheDocument();
      expect(screen.getByText(/Valor total:/)).toHaveTextContent(/300/);

      await user.click(
        screen.getByRole('button', { name: /Exportar a Excel/ }),
      );
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        '/reports/inventario/excel',
        'inventario.xlsx',
      );
    });
  });

  it('switches views from the tabs', async () => {
    const user = userEvent.setup();
    renderAt();

    await screen.findByText('Ferretería Sur');
    await user.click(screen.getByRole('tab', { name: /Ventas/ }));

    expect(await screen.findByText('Unidades vendidas')).toBeInTheDocument();
  });
});
