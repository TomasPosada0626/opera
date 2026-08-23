import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
import ProductsPage from './ProductsPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type {
  Category,
  PaginatedResult,
  Product,
  Unit,
} from '../types/product';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as unknown as Mock;

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

function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles,
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

const category: Category = { id: 'cat-1', name: 'Muebles', isActive: true };
const unit: Unit = {
  id: 'unit-1',
  name: 'Unidad',
  abbreviation: 'un',
  isActive: true,
};

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    sku: 'PT-1',
    name: 'Silla de madera',
    type: 'FINISHED_GOOD',
    category,
    unit,
    minStock: null,
    maxStock: null,
    finish: null,
    material: null,
    size: null,
    isActive: true,
    ...overrides,
  };
}

function paginated<T>(data: T[]): PaginatedResult<T> {
  return {
    data,
    meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 },
  };
}

function mockHappyPathGets(products: Product[] = []) {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (options?.method) {
      return Promise.reject(new Error(`Unexpected write: ${path}`));
    }
    if (path.startsWith('/products'))
      return Promise.resolve(paginated(products));
    if (path.startsWith('/categories'))
      return Promise.resolve(paginated([category]));
    if (path.startsWith('/units')) return Promise.resolve(paginated([unit]));
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

describe('ProductsPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per product with its type, category, and unit', async () => {
    mockHappyPathGets([buildProduct()]);

    renderWithClient(<ProductsPage />);

    expect(
      await screen.findByText('PT-1 — Silla de madera'),
    ).toBeInTheDocument();
    expect(screen.getByText('Producto terminado')).toBeInTheDocument();
    expect(screen.getByText('Muebles')).toBeInTheDocument();
    expect(screen.getByText('un')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('shows the empty message when there are no products', async () => {
    mockHappyPathGets([]);

    renderWithClient(<ProductsPage />);

    expect(
      await screen.findByText('No se encontraron productos.'),
    ).toBeInTheDocument();
  });

  it('hides "Nuevo producto" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockHappyPathGets([buildProduct()]);

    renderWithClient(<ProductsPage />);

    await screen.findByText('PT-1 — Silla de madera');
    expect(
      screen.queryByRole('button', { name: 'Nuevo producto' }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal, populates category/unit selects, and submits with the right body', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    const user = userEvent.setup();
    mockHappyPathGets([]);

    renderWithClient(<ProductsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Nuevo producto' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nuevo producto' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('SKU'), 'PT-2');
    await user.type(screen.getByLabelText('Nombre'), 'Mesa de centro');

    const categorySelect = await screen.findByLabelText('Categoría');
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Muebles' }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(categorySelect, 'cat-1');

    const unitSelect = screen.getByLabelText('Unidad');
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Unidad (un)' }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(unitSelect, 'unit-1');

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST')
        return Promise.resolve({ id: 'product-2' });
      if (path.startsWith('/products')) return Promise.resolve(paginated([]));
      if (path.startsWith('/categories'))
        return Promise.resolve(paginated([category]));
      if (path.startsWith('/units')) return Promise.resolve(paginated([unit]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      const postCall = mockedApiFetch.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'POST',
      ) as [string, RequestInit] | undefined;
      expect(postCall?.[0]).toBe('/products');
      expect(JSON.parse(postCall?.[1].body as string)).toEqual({
        sku: 'PT-2',
        name: 'Mesa de centro',
        type: 'FINISHED_GOOD',
        categoryId: 'cat-1',
        unitId: 'unit-1',
        minStock: undefined,
        maxStock: undefined,
        finish: undefined,
        material: undefined,
        size: undefined,
      });
    });
  });

  it('submits the descriptive attributes when filled', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    const user = userEvent.setup();
    mockHappyPathGets([]);

    renderWithClient(<ProductsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Nuevo producto' }),
    );
    await user.type(screen.getByLabelText('SKU'), 'PT-3');
    await user.type(screen.getByLabelText('Nombre'), 'Silla en roble');

    const categorySelect = await screen.findByLabelText('Categoría');
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Muebles' }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(categorySelect, 'cat-1');
    const unitSelect = screen.getByLabelText('Unidad');
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Unidad (un)' }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(unitSelect, 'unit-1');

    await user.type(screen.getByLabelText('Acabado (opcional)'), 'Natural');
    await user.type(screen.getByLabelText('Material (opcional)'), 'Roble');
    await user.type(screen.getByLabelText('Tamaño (opcional)'), 'Grande');

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST')
        return Promise.resolve({ id: 'product-3' });
      if (path.startsWith('/products')) return Promise.resolve(paginated([]));
      if (path.startsWith('/categories'))
        return Promise.resolve(paginated([category]));
      if (path.startsWith('/units')) return Promise.resolve(paginated([unit]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      const postCall = mockedApiFetch.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'POST',
      ) as [string, RequestInit] | undefined;
      const body = JSON.parse(postCall?.[1].body as string) as {
        finish: string;
        material: string;
        size: string;
      };
      expect(body.finish).toBe('Natural');
      expect(body.material).toBe('Roble');
      expect(body.size).toBe('Grande');
    });
  });

  it('opens the edit modal pre-filled with the selected product', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockHappyPathGets([buildProduct({ minStock: '5', maxStock: '50' })]);
    const user = userEvent.setup();

    renderWithClient(<ProductsPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByRole('dialog', { name: 'Editar producto' }),
    ).toBeInTheDocument();
    const skuInput: HTMLInputElement = screen.getByLabelText('SKU');
    expect(skuInput.value).toBe('PT-1');
    const minStockInput: HTMLInputElement = screen.getByLabelText(
      'Stock mínimo (opcional)',
    );
    expect(minStockInput.value).toBe('5');
  });

  it('sends the debounced search term as a query param', async () => {
    mockHappyPathGets([]);
    const user = userEvent.setup();

    renderWithClient(<ProductsPage />);

    await user.type(
      screen.getByPlaceholderText('Buscar por nombre o SKU…'),
      'silla',
    );

    await waitFor(
      () => {
        const matched = mockedApiFetch.mock.calls.some((call: unknown[]) => {
          const path = call[0] as string;
          return path.startsWith('/products?') && path.includes('search=silla');
        });
        expect(matched).toBe(true);
      },
      { timeout: 2000 },
    );
  });
});
