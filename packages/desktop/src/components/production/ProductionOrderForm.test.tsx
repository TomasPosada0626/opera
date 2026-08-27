import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ProductionOrderForm } from './ProductionOrderForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { PaginatedResult, Product } from '../../types/product';
import type { Warehouse } from '../../types/inventory';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const product: Product = {
  id: 'product-1',
  sku: 'PT-1',
  name: 'Silla de madera',
  type: 'FINISHED_GOOD',
  category: { id: 'cat-1', name: 'Muebles', isActive: true },
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

// Dos bodegas, no una: con exactamente una, WarehouseSelect se
// autoselecciona y queda oculto — este archivo ejercita el select real.
const warehouse2: Warehouse = {
  id: 'warehouse-2',
  name: 'Bodega secundaria',
  location: null,
  isActive: true,
};

function productsResponse(data: Product[]): PaginatedResult<Product> {
  return {
    data,
    meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
  };
}

function warehousesResponse(data: Warehouse[]): PaginatedResult<Warehouse> {
  return {
    data,
    meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 },
  };
}

function mockHappyPathGets() {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (!options?.method && path.startsWith('/products')) {
      return Promise.resolve(productsResponse([product]));
    }
    if (!options?.method && path.startsWith('/warehouses')) {
      return Promise.resolve(warehousesResponse([warehouse, warehouse2]));
    }
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

async function selectProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
    'silla',
  );
  await user.click(await screen.findByText('PT-1 — Silla de madera'));
}

async function selectWarehouse(user: ReturnType<typeof userEvent.setup>) {
  const select = await screen.findByLabelText('Bodega');
  await waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Bodega principal' }),
    ).toBeInTheDocument(),
  );
  await user.selectOptions(select, 'warehouse-1');
}

function findPostCall(): [string, RequestInit] | undefined {
  return mockedApiFetch.mock.calls.find(
    (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit] | undefined;
}

describe('ProductionOrderForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('blocks submit and shows an error when no product is selected', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<ProductionOrderForm onSuccess={onSuccess} />);

    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad a producir'), '5');
    await user.click(screen.getByRole('button', { name: 'Crear orden' }));

    expect(
      await screen.findByText('Selecciona un producto'),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects a zero or missing quantity', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<ProductionOrderForm onSuccess={vi.fn()} />);

    await selectProduct(user);
    await selectWarehouse(user);
    await user.click(screen.getByRole('button', { name: 'Crear orden' }));

    expect(await screen.findByText('Ingresa una cantidad')).toBeInTheDocument();
  });

  it('submits a valid order to POST /production-orders', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<ProductionOrderForm onSuccess={onSuccess} />);

    await selectProduct(user);
    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad a producir'), '10');
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ id: 'order-1' });
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([product]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse, warehouse2]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Crear orden' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(postCall?.[0]).toBe('/production-orders');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 10,
    });
  });

  it('shows the backend shortage message when the order cannot be created', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<ProductionOrderForm onSuccess={vi.fn()} />);

    await selectProduct(user);
    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad a producir'), '10');
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.reject(
          new ApiError(
            400,
            'Stock insuficiente de materias primas para esta orden',
          ),
        );
      }
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([product]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse, warehouse2]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Crear orden' }));

    expect(
      await screen.findByText(
        'Stock insuficiente de materias primas para esta orden',
      ),
    ).toBeInTheDocument();
  });
});
