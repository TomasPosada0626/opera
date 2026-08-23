import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import KardexPage from './KardexPage';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult, Product } from '../types/product';
import type { StockMovementEntry, Warehouse } from '../types/inventory';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(
  ui: ReactElement,
  initialPath = '/inventario/product-1/kardex',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/inventario/:productId/kardex" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const product: Product = {
  id: 'product-1',
  sku: 'SKU-1',
  name: 'Tornillo 1/4',
  type: 'RAW_MATERIAL',
  category: { id: 'cat-1', name: 'Ferretería', isActive: true },
  unit: { id: 'unit-1', name: 'Unidad', abbreviation: 'un', isActive: true },
  minStock: null,
  maxStock: null,
  finish: null,
  material: null,
  size: null,
  isActive: true,
};

const warehouse: Warehouse = {
  id: 'warehouse-1',
  name: 'Bodega principal',
  location: null,
  isActive: true,
};

function buildMovement(
  overrides: Partial<StockMovementEntry> = {},
): StockMovementEntry {
  return {
    id: 'movement-1',
    type: 'ENTRADA',
    quantity: '10.000',
    unitCost: '2.5000',
    reason: null,
    location: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    warehouse: { id: 'warehouse-1', name: 'Bodega principal' },
    user: { id: 'user-1', name: 'Admin' },
    ...overrides,
  };
}

function kardexResponse(
  data: StockMovementEntry[],
): PaginatedResult<StockMovementEntry> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

function warehousesResponse(data: Warehouse[]): PaginatedResult<Warehouse> {
  return {
    data,
    meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 },
  };
}

function mockRoutes(movements: StockMovementEntry[]) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/products/')) return Promise.resolve(product);
    if (path.startsWith('/inventory/product-1/kardex'))
      return Promise.resolve(kardexResponse(movements));
    if (path.startsWith('/warehouses'))
      return Promise.resolve(warehousesResponse([warehouse]));
    return Promise.reject(new Error(`Unexpected: ${path}`));
  });
}

describe('KardexPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows the product name and SKU in the header once loaded', async () => {
    mockRoutes([]);
    renderWithClient(<KardexPage />);

    expect(
      await screen.findByRole('heading', { name: 'Kardex — Tornillo 1/4' }),
    ).toBeInTheDocument();
    expect(screen.getByText('SKU SKU-1')).toBeInTheDocument();
  });

  it('renders a row per movement with the quantity, unit and a type badge', async () => {
    mockRoutes([buildMovement()]);
    renderWithClient(<KardexPage />);

    expect(await screen.findByText('10.000 un')).toBeInTheDocument();
    expect(screen.getByText('Entrada')).toBeInTheDocument();
    expect(screen.getAllByText('Bodega principal').length).toBeGreaterThan(0);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows a dash for unitCost and reason when absent', async () => {
    mockRoutes([
      buildMovement({ type: 'SALIDA', unitCost: null, reason: null }),
    ]);
    renderWithClient(<KardexPage />);

    await screen.findByText('Salida');
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the empty message when there are no movements', async () => {
    mockRoutes([]);
    renderWithClient(<KardexPage />);

    expect(
      await screen.findByText('Sin movimientos registrados.'),
    ).toBeInTheDocument();
  });

  it('sends the selected warehouseId as a query param and resets to page 1', async () => {
    mockRoutes([buildMovement()]);
    const user = userEvent.setup();
    renderWithClient(<KardexPage />);

    await screen.findByText('10.000 un');
    const select = await screen.findByLabelText('Filtrar por bodega');
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Bodega principal' }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(select, 'warehouse-1');

    await waitFor(() => {
      const matched = mockedApiFetch.mock.calls.some((call: unknown[]) => {
        const path = call[0] as string;
        return (
          path.startsWith('/inventory/product-1/kardex') &&
          path.includes('warehouseId=warehouse-1')
        );
      });
      expect(matched).toBe(true);
    });
  });
});
