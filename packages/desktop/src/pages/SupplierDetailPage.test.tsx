import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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
import { downloadFile } from '../lib/download-file';
import type { PaginatedResult } from '../types/product';
import type { Supplier, SupplierProduct } from '../types/supplier';
import type { PurchaseOrder } from '../types/purchase-order';
import { buildPurchaseOrder } from '../test/factories';

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

const balance = {
  totalPurchased: '9500',
  totalReceived: '7500',
  totalPaid: '5000',
  payable: '2500',
};

// GETs de la ficha y del formulario de compra (que lista proveedores y
// bodegas); cualquier escritura no esperada falla el test.
function detailGet(
  path: string,
  products: SupplierProduct[],
  purchases: PurchaseOrder[],
) {
  if (path === '/suppliers/supplier-1') return Promise.resolve(supplier);
  if (path === '/suppliers/supplier-1/balance') return Promise.resolve(balance);
  if (path.startsWith('/suppliers?'))
    return Promise.resolve(paginated([supplier]));
  if (path.startsWith('/supplier-products'))
    return Promise.resolve(paginated(products));
  if (path.startsWith('/purchase-orders'))
    return Promise.resolve(paginated(purchases));
  if (path.startsWith('/warehouses'))
    return Promise.resolve([{ id: 'warehouse-1', name: 'Bodega principal' }]);
  return Promise.reject(new Error(`Unexpected GET: ${path}`));
}

function mockDetailGets(
  products: SupplierProduct[] = [],
  purchases: PurchaseOrder[] = [],
) {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (options?.method) {
      return Promise.reject(new Error(`Unexpected write: ${path}`));
    }
    return detailGet(path, products, purchases);
  });
}

describe('SupplierDetailPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedDownloadFile.mockReset();
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

  it('shows what is owed to the supplier, and lists prices and purchases', async () => {
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
        buildPurchaseOrder({
          status: 'PARCIAL',
          total: '9500',
          payable: '2500',
          paymentStatus: 'ABONADA',
        }),
      ],
    );

    renderWithClient(<SupplierDetailPage />);

    expect(await screen.findByText('MP-1 — Tabla de pino')).toBeInTheDocument();
    expect(screen.getByText('$ 15.000')).toBeInTheDocument();
    expect(await screen.findByText('#7')).toHaveAttribute(
      'href',
      '/compras/po-1',
    );
    expect(screen.getByText('Llegó una parte')).toBeInTheDocument();
    expect(screen.getByText('Debe $ 2.500')).toBeInTheDocument();
    // Saldo del proveedor arriba.
    expect(await screen.findByText('Recibido: $ 7.500')).toBeInTheDocument();
  });

  it('hides "Eliminar" for a price row when the user is not ADMIN', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockDetailGets([
      {
        id: 'sp-1',
        price: '15000',
        product: { id: 'product-1', sku: 'MP-1', name: 'Tabla de pino' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    renderWithClient(<SupplierDetailPage />);

    await screen.findByText('MP-1 — Tabla de pino');
    expect(
      screen.queryByRole('button', { name: 'Eliminar' }),
    ).not.toBeInTheDocument();
  });

  it('deletes a price row via "Eliminar" for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    const priceRow: SupplierProduct = {
      id: 'sp-1',
      price: '15000',
      product: { id: 'product-1', sku: 'MP-1', name: 'Tabla de pino' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE' && path === '/supplier-products/sp-1') {
        return Promise.resolve(undefined);
      }
      if (options?.method) {
        return Promise.reject(new Error(`Unexpected write: ${path}`));
      }
      return detailGet(path, [priceRow], []);
    });
    const user = userEvent.setup();

    renderWithClient(<SupplierDetailPage />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith('/supplier-products/sp-1', {
      method: 'DELETE',
    });
  });

  it('hides "Agregar precio" and "Nueva compra" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockDetailGets();

    renderWithClient(<SupplierDetailPage />);

    await screen.findByText('Maderas del Norte S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Agregar precio' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Nueva compra' }),
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

  it('opens the "Nueva compra" modal for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets();
    const user = userEvent.setup();

    renderWithClient(<SupplierDetailPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Nueva compra' }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Nueva compra' }),
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

  it('closes the "Nueva compra" modal via its close button', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockDetailGets();
    const user = userEvent.setup();

    renderWithClient(<SupplierDetailPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Nueva compra' }),
    );
    await screen.findByRole('dialog', { name: 'Nueva compra' });
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(
      screen.queryByRole('dialog', { name: 'Nueva compra' }),
    ).not.toBeInTheDocument();
  });

  it('downloads the .xlsx export when "Exportar datos" is clicked', async () => {
    mockDetailGets();

    renderWithClient(<SupplierDetailPage />);
    const button = await screen.findByRole('button', {
      name: 'Exportar datos',
    });
    button.click();

    expect(mockedDownloadFile).toHaveBeenCalledWith(
      '/suppliers/supplier-1/export',
      'proveedor-supplier-1.xlsx',
    );
  });
});
