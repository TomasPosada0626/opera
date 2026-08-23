import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import InventoryPage from './InventoryPage';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult, Product, StockSummary } from '../types/product';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
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

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    sku: 'SKU-1',
    name: 'Producto uno',
    type: 'FINISHED_GOOD',
    category: { id: 'cat-1', name: 'Categoría A', isActive: true },
    unit: { id: 'unit-1', name: 'Unidad', abbreviation: 'un', isActive: true },
    minStock: null,
    maxStock: null,
    finish: null,
    material: null,
    size: null,
    isActive: true,
    ...overrides,
  };
}

function productsResponse(data: Product[]): PaginatedResult<Product> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('InventoryPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('renders products with their stock once both requests resolve', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/products')) {
        return Promise.resolve(productsResponse([buildProduct()]));
      }
      if (path.startsWith('/inventory/stock')) {
        return Promise.resolve([
          { productId: 'product-1', stock: '15' },
        ] satisfies StockSummary[]);
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderWithClient(<InventoryPage />);

    expect(await screen.findByText('Producto uno')).toBeInTheDocument();
    expect(await screen.findByText('15 un')).toBeInTheDocument();
  });

  it('shows a placeholder dash while stock has not loaded yet', () => {
    mockedApiFetch.mockImplementation(() => new Promise(() => {}));

    renderWithClient(<InventoryPage />);

    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('flags a product below its minStock threshold as low stock', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/products')) {
        return Promise.resolve(
          productsResponse([buildProduct({ minStock: '10' })]),
        );
      }
      if (path.startsWith('/inventory/stock')) {
        return Promise.resolve([
          { productId: 'product-1', stock: '3' },
        ] satisfies StockSummary[]);
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderWithClient(<InventoryPage />);

    const badge = await screen.findByText('3 un');
    expect(badge.className).toContain('warning');
  });

  it('does not flag a product at or above its minStock threshold', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/products')) {
        return Promise.resolve(
          productsResponse([buildProduct({ minStock: '10' })]),
        );
      }
      if (path.startsWith('/inventory/stock')) {
        return Promise.resolve([
          { productId: 'product-1', stock: '20' },
        ] satisfies StockSummary[]);
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderWithClient(<InventoryPage />);

    const stockCell = await screen.findByText('20 un');
    expect(stockCell.className).not.toContain('warning');
  });

  it('sends the debounced search term as a query param', async () => {
    mockedApiFetch.mockResolvedValue(productsResponse([]));
    const user = userEvent.setup();

    renderWithClient(<InventoryPage />);

    await user.type(
      screen.getByPlaceholderText('Buscar por nombre o SKU…'),
      'tornillo',
    );

    await waitFor(
      () => {
        const matched = mockedApiFetch.mock.calls.some((call: unknown[]) => {
          const path = call[0] as string;
          return (
            path.startsWith('/products?') && path.includes('search=tornillo')
          );
        });
        expect(matched).toBe(true);
      },
      { timeout: 2000 },
    );
  });
});
