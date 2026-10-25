import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import CustomerDetailPage from './CustomerDetailPage';
import { apiFetch } from '../lib/api-client';
import { downloadFile } from '../lib/download-file';
import { buildOrder, buildPayment, paginated } from '../test/factories';
import type { Customer } from '../types/customer';
import type { Order } from '../types/order';
import type { CustomerPayment } from '../hooks/useCustomerPayments';

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
  email: 'compras@valle.co',
  phone: '300 000 0000',
  address: 'Calle 1 # 2-3',
  isActive: true,
};

function mockDetailGets(
  orders: Order[] = [],
  balance = { totalBilled: '0', totalPaid: '0', balance: '0' },
  payments: CustomerPayment[] = [],
) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/customers/customer-1') return Promise.resolve(customer);
    if (path === '/customers/customer-1/balance')
      return Promise.resolve(balance);
    if (path === '/customers/customer-1/payments')
      return Promise.resolve(payments);
    if (path.startsWith('/orders')) return Promise.resolve(paginated(orders));
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedDownloadFile.mockReset();
  });

  it('shows the customer name, active badge and contact data', async () => {
    mockDetailGets();

    renderWithClient(<CustomerDetailPage />);

    expect(
      await screen.findByRole('heading', { name: 'Muebles del Valle S.A.S.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('NIT 900123456-1')).toBeInTheDocument();
    expect(screen.getByText('compras@valle.co')).toBeInTheDocument();
  });

  it('shows the dispatched/paid/pending summary', async () => {
    mockDetailGets([], {
      totalBilled: '230',
      totalPaid: '130',
      balance: '100',
    });

    renderWithClient(<CustomerDetailPage />);

    expect(await screen.findByText(/\$\s?230/)).toBeInTheDocument();
    expect(screen.getByText(/\$\s?130/)).toBeInTheDocument();
    expect(screen.getByText(/\$\s?100/)).toBeInTheDocument();
  });

  it('shows the empty messages when the customer has no orders or payments yet', async () => {
    mockDetailGets([]);

    renderWithClient(<CustomerDetailPage />);

    expect(
      await screen.findByText('Este cliente todavía no tiene pedidos.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Todavía no hay abonos registrados.'),
    ).toBeInTheDocument();
  });

  it('lists the order history and links each row to its detail page', async () => {
    mockDetailGets([buildOrder({ status: 'EN_ALMACEN' })]);

    renderWithClient(<CustomerDetailPage />);

    const table = await screen.findByRole('table');
    expect(await within(table).findByText('En almacén')).toBeInTheDocument();
    expect(within(table).getByText('#12')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Ver detalle/ });
    expect(link).toHaveAttribute('href', '/pedidos/order-1');
    expect(screen.getByText('1 pedidos en total')).toBeInTheDocument();
  });

  it('lists every payment, marking voided ones', async () => {
    mockDetailGets([], undefined, [
      {
        ...buildPayment({ note: 'Nequi', method: 'TRANSFERENCIA' }),
        remission: { id: 'r1', number: 3, orderId: 'order-1' },
      },
      {
        ...buildPayment({
          id: 'payment-2',
          voidedAt: '2026-01-22T00:00:00.000Z',
          voidReason: 'Cheque devuelto',
        }),
        remission: { id: 'r1', number: 3, orderId: 'order-1' },
      },
    ]);

    renderWithClient(<CustomerDetailPage />);

    expect(await screen.findByText(/Nequi/)).toBeInTheDocument();
    expect(screen.getByText(/Anulado: Cheque devuelto/)).toBeInTheDocument();
    expect(screen.getAllByText(/Rem\. 3/)).toHaveLength(2);
  });

  it('downloads the .xlsx export when "Exportar datos" is clicked', async () => {
    mockDetailGets();

    renderWithClient(<CustomerDetailPage />);
    const button = await screen.findByRole('button', {
      name: /Exportar datos/,
    });
    button.click();

    expect(mockedDownloadFile).toHaveBeenCalledWith(
      '/customers/customer-1/export',
      'cliente-customer-1.xlsx',
    );
  });
});
