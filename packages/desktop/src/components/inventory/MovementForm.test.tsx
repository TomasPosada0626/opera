import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MovementForm } from './MovementForm';
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
  sku: 'SKU-1',
  name: 'Tornillo 1/4',
  type: 'RAW_MATERIAL',
  category: { id: 'cat-1', name: 'Ferretería' },
  unit: { id: 'unit-1', name: 'Unidad', abbreviation: 'un' },
  minStock: null,
  maxStock: null,
  isActive: true,
};

const warehouse: Warehouse = {
  id: 'warehouse-1',
  name: 'Bodega principal',
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
      return Promise.resolve(warehousesResponse([warehouse]));
    }
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

async function selectProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
    'tornillo',
  );
  await user.click(await screen.findByText('SKU-1 — Tornillo 1/4'));
}

function findPostCall(): [string, RequestInit] | undefined {
  return mockedApiFetch.mock.calls.find(
    (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit] | undefined;
}

async function selectWarehouse(user: ReturnType<typeof userEvent.setup>) {
  const select = await screen.findByLabelText('Bodega');
  await waitFor(() =>
    expect(within(select).getByText('Bodega principal')).toBeInTheDocument(),
  );
  await user.selectOptions(select, 'warehouse-1');
}

describe('MovementForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows the unit cost field only for ENTRADA', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<MovementForm onSuccess={vi.fn()} />);

    expect(
      screen.getByLabelText('Costo unitario (opcional)'),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText('Tipo de movimiento'),
      'SALIDA',
    );
    expect(
      screen.queryByLabelText('Costo unitario (opcional)'),
    ).not.toBeInTheDocument();
  });

  it('blocks submit and shows an error when no product is selected', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<MovementForm onSuccess={onSuccess} />);

    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad'), '5');
    await user.click(
      screen.getByRole('button', { name: 'Registrar movimiento' }),
    );

    expect(
      await screen.findByText('Selecciona un producto'),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      mockedApiFetch.mock.calls.some(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('rejects a zero quantity and a missing reason for AJUSTE', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<MovementForm onSuccess={vi.fn()} />);

    await user.selectOptions(
      screen.getByLabelText('Tipo de movimiento'),
      'AJUSTE',
    );
    await selectProduct(user);
    await selectWarehouse(user);
    await user.type(
      screen.getByLabelText('Cantidad (negativa para reducir)'),
      '0',
    );
    await user.click(
      screen.getByRole('button', { name: 'Registrar movimiento' }),
    );

    expect(await screen.findByText('No puede ser 0')).toBeInTheDocument();
    expect(
      screen.getByText('El motivo es obligatorio para un ajuste'),
    ).toBeInTheDocument();
  });

  it('submits an ENTRADA with unitCost to POST /inventory/entradas', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<MovementForm onSuccess={onSuccess} />);

    await selectProduct(user);
    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.type(screen.getByLabelText('Costo unitario (opcional)'), '2.5');
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({ id: 'movement-1' });
      }
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([product]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(
      screen.getByRole('button', { name: 'Registrar movimiento' }),
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(postCall?.[0]).toBe('/inventory/entradas');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 10,
      unitCost: 2.5,
    });
  });

  it('submits an AJUSTE with a signed quantity and reason to POST /inventory/ajustes', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<MovementForm onSuccess={onSuccess} />);

    await user.selectOptions(
      screen.getByLabelText('Tipo de movimiento'),
      'AJUSTE',
    );
    await selectProduct(user);
    await selectWarehouse(user);
    await user.type(
      screen.getByLabelText('Cantidad (negativa para reducir)'),
      '-3',
    );
    await user.type(screen.getByLabelText('Motivo'), 'Conteo físico');
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({ id: 'movement-1' });
      }
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([product]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(
      screen.getByRole('button', { name: 'Registrar movimiento' }),
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(postCall?.[0]).toBe('/inventory/ajustes');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: -3,
      reason: 'Conteo físico',
    });
  });

  it('shows an inline API error and does not call onSuccess when the request fails', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<MovementForm onSuccess={onSuccess} />);

    await selectProduct(user);
    await selectWarehouse(user);
    await user.type(screen.getByLabelText('Cantidad'), '10');
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.reject(new ApiError(400, 'Stock insuficiente'));
      }
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([product]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(
      screen.getByRole('button', { name: 'Registrar movimiento' }),
    );

    expect(await screen.findByText('Stock insuficiente')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
