import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SupplierPurchaseForm } from './SupplierPurchaseForm';
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
  sku: 'MP-1',
  name: 'Tabla de pino',
  type: 'RAW_MATERIAL',
  category: { id: 'cat-1', name: 'Materias Primas', isActive: true },
  unit: { id: 'unit-1', name: 'Metro', abbreviation: 'm', isActive: true },
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
// autoselecciona y queda oculto (ver WarehouseSelect.test.tsx) — este
// formulario debe ejercitar el select real.
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

async function pickProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
    'pino',
  );
  await user.click(await screen.findByText('MP-1 — Tabla de pino'));
}

async function selectWarehouse(user: ReturnType<typeof userEvent.setup>) {
  const select = await screen.findByLabelText('Bodega');
  await waitFor(() =>
    expect(within(select).getByText('Bodega principal')).toBeInTheDocument(),
  );
  await user.selectOptions(select, 'warehouse-1');
}

function findPostCall(): [string, RequestInit] | undefined {
  return mockedApiFetch.mock.calls.find(
    (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit] | undefined;
}

describe('SupplierPurchaseForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('requires a product before submitting', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );

    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.type(screen.getByLabelText('Costo unitario'), '4500');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    expect(
      await screen.findByText('Selecciona un producto'),
    ).toBeInTheDocument();
    expect(findPostCall()).toBeUndefined();
  });

  it('requires a warehouse before submitting', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );

    await pickProduct(user);
    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.type(screen.getByLabelText('Costo unitario'), '4500');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    expect(
      await screen.findByText('Selecciona una bodega', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(findPostCall()).toBeUndefined();
  });

  it('requires quantity and unit cost greater than 0', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );

    await pickProduct(user);
    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad'), '0');
    await user.type(screen.getByLabelText('Costo unitario'), '0');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    expect(
      (await screen.findAllByText('Debe ser mayor a 0')).length,
    ).toBeGreaterThan(0);
  });

  it('submits the purchase without a date when left empty', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={onSuccess} />,
    );

    await pickProduct(user);
    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.type(screen.getByLabelText('Costo unitario'), '4500');

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST')
        return Promise.resolve({ id: 'purchase-1' });
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([product]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse, warehouse2]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(postCall?.[0]).toBe('/supplier-purchases');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      supplierId: 'supplier-1',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 10,
      unitCost: 4500,
      purchasedAt: undefined,
    });
  });

  it('shows the backend error message when saving fails', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );

    await pickProduct(user);
    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.type(screen.getByLabelText('Costo unitario'), '4500');

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST')
        return Promise.reject(new ApiError(404, 'Producto no encontrado'));
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([product]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse, warehouse2]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    expect(
      await screen.findByText('Producto no encontrado'),
    ).toBeInTheDocument();
  });
});
