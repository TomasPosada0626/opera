import type { ReactElement } from 'react';
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
import OrdersPage from './OrdersPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import {
  buildDashboardSummary,
  buildOrder,
  buildRemission,
  fakeJwt,
  paginated,
} from '../test/factories';
import type { Order } from '../types/order';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    shortages = [];
  },
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement, initialEntry = '/pedidos') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// El listado pide pedidos y, para los conteos de los filtros, el resumen
// del dashboard — cada uno con su forma.
function mockApi(orders: Order[], summary = buildDashboardSummary()) {
  mockedApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path.startsWith('/dashboard') ? summary : paginated(orders),
    ),
  );
}

describe('OrdersPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
    vi.useRealTimers();
  });

  it('renders a row per order with its number, customer and computed total', async () => {
    mockApi([buildOrder()]);

    renderWithClient(<OrdersPage />);

    expect(
      await screen.findByText('Muebles del Valle S.A.S.'),
    ).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('#12')).toBeInTheDocument();
    expect(within(table).getByText('Pendiente')).toBeInTheDocument();
    expect(within(table).getByText('Silla de madera')).toBeInTheDocument();
    // 3 * 25 = 75
    expect(within(table).getByText(/\$\s?75/)).toBeInTheDocument();
  });

  it('summarizes several products and shows the dispatched share', async () => {
    mockApi([
      buildOrder({
        status: 'EN_ALMACEN',
        items: [
          {
            id: 'item-1',
            productId: 'p1',
            product: { id: 'p1', sku: 'A', name: 'Silla' },
            quantity: '2',
            unitPrice: '10',
          },
          {
            id: 'item-2',
            productId: 'p2',
            product: { id: 'p2', sku: 'B', name: 'Mesa' },
            quantity: '2',
            unitPrice: '10',
          },
        ],
        remissions: [
          buildRemission({
            items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '2' }],
          }),
        ],
      }),
    ]);

    renderWithClient(<OrdersPage />);

    expect(await screen.findByText('2 productos')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows the empty message when there are no orders', async () => {
    mockApi([]);

    renderWithClient(<OrdersPage />);

    expect(
      await screen.findByText('No hay pedidos registrados.'),
    ).toBeInTheDocument();
  });

  it('flags an order whose promised date already passed', async () => {
    mockApi([
      buildOrder({
        status: 'EN_PRODUCCION',
        estimatedDeliveryDate: '2020-01-01T00:00:00.000Z',
      }),
    ]);

    renderWithClient(<OrdersPage />);

    expect(await screen.findByText(/días tarde/)).toBeInTheDocument();
  });

  it('starts on the overdue filter when the dashboard links with ?filtro=atrasados', async () => {
    mockApi(
      [],
      buildDashboardSummary({ overdueOrders: { count: 3, orders: [] } }),
    );

    renderWithClient(<OrdersPage />, '/pedidos?filtro=atrasados');

    expect(
      await screen.findByText('Ningún pedido atrasado.'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('overdue=true'),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('sortBy=estimatedDeliveryDate'),
    );
    expect(screen.getByRole('button', { name: /Atrasados/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // El conteo del resumen aparece en el filtro.
    expect(
      within(screen.getByRole('button', { name: /Atrasados/ })).getByText('3'),
    ).toBeInTheDocument();
  });

  it('hides "Nuevo pedido" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockApi([buildOrder()]);

    renderWithClient(<OrdersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: /Nuevo pedido/ }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal when "Nuevo pedido" is clicked', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockApi([]);
    const user = userEvent.setup();

    renderWithClient(<OrdersPage />);

    await user.click(
      await screen.findByRole('button', { name: /Nuevo pedido/ }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Nuevo pedido' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Crear pedido/ }),
    ).toBeInTheDocument();
  });

  it('links each row to its detail page', async () => {
    mockApi([buildOrder()]);

    renderWithClient(<OrdersPage />);

    const link = await screen.findByRole('link', {
      name: 'Ver detalle del pedido 12',
    });
    expect(link).toHaveAttribute('href', '/pedidos/order-1');
  });

  it('refetches with the status query param when a filter pill is clicked', async () => {
    mockApi([buildOrder()]);
    const user = userEvent.setup();

    renderWithClient(<OrdersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    await user.click(screen.getByRole('button', { name: 'En producción' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=EN_PRODUCCION'),
      ),
    );
  });

  it('searches by order number', async () => {
    mockApi([buildOrder()]);
    const user = userEvent.setup();

    renderWithClient(<OrdersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    await user.type(
      screen.getByLabelText('Buscar pedido por número o cliente'),
      '12',
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=12'),
      ),
    );
  });

  it('shows the "Enviar a producción" row action only for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockApi([buildOrder()]);

    renderWithClient(<OrdersPage />);

    expect(
      await screen.findByRole('button', { name: /Enviar a producción/ }),
    ).toBeInTheDocument();
  });

  it('hides the row status action for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockApi([buildOrder()]);

    renderWithClient(<OrdersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: /Enviar a producción/ }),
    ).not.toBeInTheDocument();
  });
});
