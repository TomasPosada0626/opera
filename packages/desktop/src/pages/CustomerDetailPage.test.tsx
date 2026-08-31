import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import CustomerDetailPage from './CustomerDetailPage';
import { apiFetch } from '../lib/api-client';
import { downloadFile } from '../lib/download-file';
import type { PaginatedResult } from '../types/product';
import type { Customer } from '../types/customer';
import type { Order } from '../types/order';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock('../lib/download-file', () => ({
  downloadFile: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;
const mockedDownloadFile = downloadFile as unknown as Mock;

function renderWithClient(
  ui: ReactElement,
  initialPath = '/clientes/customer-1',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/clientes/:customerId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const customer: Customer = {
  id: 'customer-1',
  name: 'Muebles del Valle S.A.S.',
  taxId: '900123456-1',
  email: null,
  phone: null,
  address: null,
  isActive: true,
};

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: 'PENDIENTE',
    customer,
    warehouse: {
      id: 'warehouse-1',
      name: 'Bodega principal',
      location: null,
      isActive: true,
    },
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        product: { id: 'product-1', sku: 'PT-1', name: 'Silla de madera' },
        quantity: '3',
        unitPrice: '25',
      },
    ],
    remissions: [],
    createdAt: '2026-01-15T10:00:00.000Z',
    productionStartedAt: null,
    warehousedAt: null,
    ...overrides,
  };
}

function paginated<T>(data: T[]): PaginatedResult<T> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

function mockDetailGets(
  orders: Order[] = [],
  balance = { totalBilled: '0', totalPaid: '0', balance: '0' },
) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/customers/customer-1') return Promise.resolve(customer);
    if (path === '/customers/customer-1/balance')
      return Promise.resolve(balance);
    if (path.startsWith('/orders')) return Promise.resolve(paginated(orders));
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedDownloadFile.mockReset();
  });

  it('shows the customer name and active badge', async () => {
    mockDetailGets();

    renderWithClient(<CustomerDetailPage />);

    expect(
      await screen.findByText('Muebles del Valle S.A.S.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('shows the billed/paid/balance summary', async () => {
    mockDetailGets([], {
      totalBilled: '230',
      totalPaid: '130',
      balance: '100',
    });

    renderWithClient(<CustomerDetailPage />);

    expect(await screen.findByText('230,00')).toBeInTheDocument();
    expect(screen.getByText('130,00')).toBeInTheDocument();
    expect(screen.getByText('100,00')).toBeInTheDocument();
  });

  it('shows the empty message when the customer has no orders yet', async () => {
    mockDetailGets([]);

    renderWithClient(<CustomerDetailPage />);

    expect(
      await screen.findByText('Este cliente todavía no tiene pedidos.'),
    ).toBeInTheDocument();
  });

  it('lists the order history and links each row to its detail page', async () => {
    mockDetailGets([buildOrder({ status: 'EN_ALMACEN' })]);

    renderWithClient(<CustomerDetailPage />);

    expect(await screen.findByText('En almacén')).toBeInTheDocument();
    expect(screen.getByText('75,00')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Ver detalle/ });
    expect(link).toHaveAttribute('href', '/pedidos/order-1');
  });

  it('downloads the .xlsx export when "Exportar datos" is clicked', async () => {
    mockDetailGets();

    renderWithClient(<CustomerDetailPage />);
    const button = await screen.findByRole('button', {
      name: 'Exportar datos',
    });
    button.click();

    expect(mockedDownloadFile).toHaveBeenCalledWith(
      '/customers/customer-1/export',
      'cliente-customer-1.xlsx',
    );
  });
});
