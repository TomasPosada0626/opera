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
import SupplierDetailPage from './SupplierDetailPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { PaginatedResult } from '../types/product';
import type {
  Supplier,
  SupplierProduct,
  SupplierPurchase,
} from '../types/supplier';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(
  ui: ReactElement,
  initialPath = '/proveedores/supplier-1',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/proveedores/:supplierId" element={ui} />
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

const supplier: Supplier = {
  id: 'supplier-1',
  name: 'Maderas del Norte S.A.S.',
  taxId: '800987654-2',
  email: null,
  phone: null,
  address: null,
  isActive: true,
};

function paginated<T>(data: T[]): PaginatedResult<T> {
  return {
    data,
    meta: { page: 1, pageSize: 50, total: data.length, totalPages: 1 },
  };
}

function mockDetailGets(
  products: SupplierProduct[] = [],
  purchases: SupplierPurchase[] = [],
) {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (options?.method) {
      return Promise.reject(new Error(`Unexpected write: ${path}`));
    }
    if (path === '/suppliers/supplier-1') return Promise.resolve(supplier);
    if (path.startsWith('/supplier-products'))
      return Promise.resolve(paginated(products));
    if (path.startsWith('/supplier-purchases'))
      return Promise.resolve(paginated(purchases));
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

describe('SupplierDetailPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('shows the supplier name and active badge', async () => {
    mockDetailGets();

    renderWithClient(<SupplierDetailPage />);

    expect(
      await screen.findByText('Maderas del Norte S.A.S.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('shows the empty messages when there are no prices or purchases yet', async () => {
    mockDetailGets();

    renderWithClient(<SupplierDetailPage />);

    expect(
      await screen.findByText(
        'Todavía no hay precios registrados para este proveedor.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Todavía no hay compras registradas para este proveedor.',
      ),
    ).toBeInTheDocument();
  });

  it('lists prices and purchases when they exist', async () => {
    mockDetailGets(
      [
        {
          id: 'sp-1',
          price: '15000',
          product: { id: 'product-1', sku: 'MP-1', name: 'Tabla de pino' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'purchase-1',
          quantity: '10',
          unitCost: '4500',
          purchasedAt: '2026-01-05T00:00:00.000Z',
          product: { id: 'product-1', sku: 'MP-1', name: 'Tabla de pino' },
          user: { id: 'user-1', name: 'Admin' },
          warehouse: { id: 'warehouse-1', name: 'Bodega principal' },
          receivedAt: null,
          stockMovementId: null,
        },
      ],
    );

    renderWithClient(<SupplierDetailPage />);

    // "MP-1 — Tabla de pino" aparece dos veces (tabla de precios y de
    // compras) — findByText fallaría con "elemento múltiple encontrado".
    expect(await screen.findAllByText('MP-1 — Tabla de pino')).toHaveLength(2);
    expect(screen.getByText('15.000,00')).toBeInTheDocument();
    expect(screen.getByText('4.500,00')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows a received badge and no action for an already-received purchase', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets(
      [],
      [
        {
          id: 'purchase-1',
          quantity: '10',
          unitCost: '4500',
          purchasedAt: '2026-01-05T00:00:00.000Z',
          product: { id: 'product-1', sku: 'MP-1', name: 'Tabla de pino' },
          user: { id: 'user-1', name: 'Admin' },
          warehouse: { id: 'warehouse-1', name: 'Bodega principal' },
          receivedAt: '2026-01-06T00:00:00.000Z',
          stockMovementId: 'movement-1',
        },
      ],
    );

    renderWithClient(<SupplierDetailPage />);

    expect(await screen.findByText('Recibida')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Marcar recibida' }),
    ).not.toBeInTheDocument();
  });

  it('shows a pending badge and "Marcar recibida" for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets(
      [],
      [
        {
          id: 'purchase-1',
          quantity: '10',
          unitCost: '4500',
          purchasedAt: '2026-01-05T00:00:00.000Z',
          product: { id: 'product-1', sku: 'MP-1', name: 'Tabla de pino' },
          user: { id: 'user-1', name: 'Admin' },
          warehouse: { id: 'warehouse-1', name: 'Bodega principal' },
          receivedAt: null,
          stockMovementId: null,
        },
      ],
    );

    renderWithClient(<SupplierDetailPage />);

    expect(await screen.findByText('Pendiente')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Marcar recibida' }),
    ).toBeInTheDocument();
  });

  it('hides "Agregar precio" and "Registrar compra" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockDetailGets();

    renderWithClient(<SupplierDetailPage />);

    await screen.findByText('Maderas del Norte S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Agregar precio' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Registrar compra' }),
    ).not.toBeInTheDocument();
  });

  it('opens the "Agregar precio" modal for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets();
    const user = userEvent.setup();

    renderWithClient(<SupplierDetailPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Agregar precio' }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Agregar precio' }),
    ).toBeInTheDocument();
  });

  it('opens the "Registrar compra" modal for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets();
    const user = userEvent.setup();

    renderWithClient(<SupplierDetailPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Registrar compra' }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Registrar compra' }),
    ).toBeInTheDocument();
  });

  it('closes the "Agregar precio" modal via its close button', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets();
    const user = userEvent.setup();

    renderWithClient(<SupplierDetailPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Agregar precio' }),
    );
    await screen.findByRole('dialog', { name: 'Agregar precio' });
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(
      screen.queryByRole('dialog', { name: 'Agregar precio' }),
    ).not.toBeInTheDocument();
  });

  it('closes the "Registrar compra" modal via its close button', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets();
    const user = userEvent.setup();

    renderWithClient(<SupplierDetailPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Registrar compra' }),
    );
    await screen.findByRole('dialog', { name: 'Registrar compra' });
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(
      screen.queryByRole('dialog', { name: 'Registrar compra' }),
    ).not.toBeInTheDocument();
  });
});
