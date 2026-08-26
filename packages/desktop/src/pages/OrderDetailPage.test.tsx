import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import OrderDetailPage from './OrderDetailPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { Order, Remission } from '../types/order';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement, initialPath = '/pedidos/order-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/pedidos/:orderId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles,
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: 'PENDIENTE',
    customer: {
      id: 'customer-1',
      name: 'Muebles del Valle S.A.S.',
      taxId: null,
      email: null,
      phone: null,
      address: null,
      isActive: true,
    },
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
        quantity: '10',
        unitPrice: '20',
      },
    ],
    remissions: [],
    createdAt: '2026-01-15T10:00:00.000Z',
    productionStartedAt: null,
    warehousedAt: null,
    ...overrides,
  };
}

function buildRemission(overrides: Partial<Remission> = {}): Remission {
  return {
    id: 'remission-1',
    number: 1,
    createdAt: '2026-01-16T10:00:00.000Z',
    user: { id: 'user-1', name: 'Admin' },
    items: [],
    paymentStatus: 'CARTERA',
    amountPaid: null,
    ...overrides,
  };
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders order items with quantity, delivered so far, and subtotal', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder());

    renderWithClient(<OrderDetailPage />);

    expect(
      await screen.findByText('Muebles del Valle S.A.S.'),
    ).toBeInTheDocument();
    expect(screen.getByText('PT-1 — Silla de madera')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument(); // nada entregado
    // total: 10 * 20 = 200.00, aparece en subtotal de línea y en el total
    expect(screen.getAllByText('200,00')).toHaveLength(2);
  });

  it('sums delivered quantity across remissions for the same order line', async () => {
    mockedApiFetch.mockResolvedValue(
      buildOrder({
        remissions: [
          buildRemission({
            items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '4' }],
          }),
          buildRemission({
            id: 'remission-2',
            number: 2,
            createdAt: '2026-01-17T10:00:00.000Z',
            items: [{ id: 'ri-2', orderItemId: 'item-1', quantity: '2' }],
          }),
        ],
      }),
    );

    renderWithClient(<OrderDetailPage />);

    await screen.findByText('PT-1 — Silla de madera');
    expect(screen.getByText('6')).toBeInTheDocument(); // 4 + 2 entregado
    expect(screen.getByText('Remisión No. 1')).toBeInTheDocument();
    expect(screen.getByText('Remisión No. 2')).toBeInTheDocument();
  });

  it('shows the empty message when nothing has been remised yet', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder());

    renderWithClient(<OrderDetailPage />);

    expect(
      await screen.findByText(
        'Todavía no se ha despachado nada de este pedido.',
      ),
    ).toBeInTheDocument();
  });

  it('hides "Nueva remisión" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(buildOrder());

    renderWithClient(<OrderDetailPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Nueva remisión' }),
    ).not.toBeInTheDocument();
  });

  it('opens the remission modal with remaining quantity per line for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(
      buildOrder({
        remissions: [
          buildRemission({
            items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '4' }],
          }),
        ],
      }),
    );
    const user = userEvent.setup();

    renderWithClient(<OrderDetailPage />);

    const button = await screen.findByRole('button', {
      name: 'Nueva remisión',
    });
    await user.click(button);

    expect(
      await screen.findByRole('dialog', { name: 'Nueva remisión' }),
    ).toBeInTheDocument();
    // Pedido 10, ya entregado 4 -> pendiente 6.
    expect(screen.getByText('Pendiente: 6 de 10')).toBeInTheDocument();
  });

  it('shows the payment status badge for each remission', async () => {
    mockedApiFetch.mockResolvedValue(
      buildOrder({
        remissions: [
          buildRemission({
            paymentStatus: 'ABONADO',
            items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '4' }],
          }),
        ],
      }),
    );

    renderWithClient(<OrderDetailPage />);

    expect(await screen.findByText('Remisión No. 1')).toBeInTheDocument();
    expect(screen.getByText('Abonó')).toBeInTheDocument();
  });

  it('shows "Editar pago" only for an ADMIN user, and opens the edit modal', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(
      buildOrder({
        remissions: [
          buildRemission({
            items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '4' }],
          }),
        ],
      }),
    );
    const user = userEvent.setup();

    renderWithClient(<OrderDetailPage />);

    const button = await screen.findByRole('button', { name: 'Editar pago' });
    await user.click(button);

    expect(
      await screen.findByRole('dialog', { name: 'Editar pago' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Estado de pago')).toHaveValue('CARTERA');
  });

  it('hides "Editar pago" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(
      buildOrder({
        remissions: [
          buildRemission({
            items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '4' }],
          }),
        ],
      }),
    );

    renderWithClient(<OrderDetailPage />);

    await screen.findByText('Remisión No. 1');
    expect(
      screen.queryByRole('button', { name: 'Editar pago' }),
    ).not.toBeInTheDocument();
  });

  it('shows the "Marcar en producción" action for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(buildOrder());

    renderWithClient(<OrderDetailPage />);

    expect(
      await screen.findByRole('button', { name: 'Marcar en producción' }),
    ).toBeInTheDocument();
  });

  it('hides the status action for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(buildOrder());

    renderWithClient(<OrderDetailPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Marcar en producción' }),
    ).not.toBeInTheDocument();
  });

  it('shows "Cancelar pedido" alongside the status action for PENDIENTE and EN_PRODUCCION', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(
      buildOrder({
        status: 'EN_PRODUCCION',
        productionStartedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderWithClient(<OrderDetailPage />);

    expect(
      await screen.findByRole('button', { name: 'Marcar enviado a almacén' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancelar pedido' }),
    ).toBeInTheDocument();
  });

  it('shows "Cancelar pedido" for an EN_ALMACEN order without remissions', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(buildOrder({ status: 'EN_ALMACEN' }));

    renderWithClient(<OrderDetailPage />);

    expect(
      await screen.findByRole('button', { name: 'Cancelar pedido' }),
    ).toBeInTheDocument();
  });

  it('hides "Cancelar pedido" once the order has a remission', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(
      buildOrder({ status: 'EN_ALMACEN', remissions: [buildRemission()] }),
    );

    renderWithClient(<OrderDetailPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Cancelar pedido' }),
    ).not.toBeInTheDocument();
  });

  it('hides "Cancelar pedido" for an already CANCELADO order', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(buildOrder({ status: 'CANCELADO' }));

    renderWithClient(<OrderDetailPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Cancelar pedido' }),
    ).not.toBeInTheDocument();
  });
});
