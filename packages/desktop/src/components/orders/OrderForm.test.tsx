import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { OrderForm } from './OrderForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Customer } from '../../types/customer';
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

const customer: Customer = {
  id: 'customer-1',
  name: 'Muebles del Valle S.A.S.',
  taxId: null,
  email: null,
  phone: null,
  address: null,
  isActive: true,
};

const warehouse: Warehouse = {
  id: 'warehouse-1',
  name: 'Bodega principal',
  location: null,
  isActive: true,
};

const chair: Product = {
  id: 'product-1',
  sku: 'PT-1',
  name: 'Silla de madera',
  type: 'FINISHED_GOOD',
  category: { id: 'cat-1', name: 'Muebles' },
  unit: { id: 'unit-1', name: 'Unidad', abbreviation: 'un' },
  minStock: null,
  maxStock: null,
  isActive: true,
};

const table: Product = {
  ...chair,
  id: 'product-2',
  sku: 'PT-2',
  name: 'Mesa de centro',
};

function productsResponse(data: Product[]): PaginatedResult<Product> {
  return {
    data,
    meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
  };
}

function customersResponse(data: Customer[]): PaginatedResult<Customer> {
  return {
    data,
    meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 },
  };
}

function warehousesResponse(data: Warehouse[]): PaginatedResult<Warehouse> {
  return {
    data,
    meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 },
  };
}

function mockHappyPathGets(products: Product[] = [chair, table]) {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (options?.method) {
      return Promise.reject(new Error(`Unexpected write: ${path}`));
    }
    if (path.startsWith('/customers')) {
      return Promise.resolve(customersResponse([customer]));
    }
    if (path.startsWith('/warehouses')) {
      return Promise.resolve(warehousesResponse([warehouse]));
    }
    if (path.startsWith('/products')) {
      return Promise.resolve(productsResponse(products));
    }
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

async function selectCustomerAndWarehouse(
  user: ReturnType<typeof userEvent.setup>,
) {
  const customerSelect = await screen.findByLabelText('Cliente');
  await waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Muebles del Valle S.A.S.' }),
    ).toBeInTheDocument(),
  );
  await user.selectOptions(customerSelect, 'customer-1');

  const warehouseSelect = screen.getByLabelText('Bodega');
  await waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Bodega principal' }),
    ).toBeInTheDocument(),
  );
  await user.selectOptions(warehouseSelect, 'warehouse-1');
}

async function pickProduct(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  optionText: string,
) {
  await user.type(
    screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
    query,
  );
  await user.click(await screen.findByText(optionText));
}

function findPostCall(): [string, RequestInit] | undefined {
  return mockedApiFetch.mock.calls.find(
    (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit] | undefined;
}

describe('OrderForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('requires customer and warehouse before submitting', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<OrderForm onSuccess={vi.fn()} />);

    await screen.findByLabelText('Cliente');
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    // { selector: 'p' } porque el placeholder del <select> ("Selecciona un
    // cliente"/"...bodega") es el mismo texto que el mensaje de error de
    // Zod a propósito — sin esto, getByText es ambiguo entre la <option> y
    // el <p> de error.
    expect(
      await screen.findByText('Selecciona un cliente', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Selecciona una bodega', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('rejects a line missing product/quantity/price', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<OrderForm onSuccess={vi.fn()} />);

    await selectCustomerAndWarehouse(user);
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    expect(
      await screen.findByText(
        'Completa producto, cantidad y precio (mayores a 0) en cada línea',
      ),
    ).toBeInTheDocument();
  });

  it('adds a second line and removes the first one', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<OrderForm onSuccess={vi.fn()} />);

    await pickProduct(user, 'silla', 'PT-1 — Silla de madera');
    await user.click(screen.getByRole('button', { name: 'Agregar producto' }));

    expect(screen.getByText('PT-1 — Silla de madera')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
    ).toBeInTheDocument();

    // Ahora hay 2 líneas -> el botón de quitar aparece; quita la primera.
    await user.click(screen.getByRole('button', { name: 'Quitar línea 1' }));

    expect(
      screen.queryByText('PT-1 — Silla de madera'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Quitar línea/ }),
    ).not.toBeInTheDocument();
  });

  it('submits a valid order with the right body', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<OrderForm onSuccess={onSuccess} />);

    await selectCustomerAndWarehouse(user);
    await pickProduct(user, 'silla', 'PT-1 — Silla de madera');
    await user.type(screen.getByLabelText('Cantidad línea 1'), '3');
    await user.type(screen.getByLabelText('Precio unitario línea 1'), '25');

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({ id: 'order-1' });
      }
      if (path.startsWith('/customers'))
        return Promise.resolve(customersResponse([customer]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse]));
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([chair, table]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(postCall?.[0]).toBe('/orders');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      customerId: 'customer-1',
      warehouseId: 'warehouse-1',
      items: [{ productId: 'product-1', quantity: 3, unitPrice: 25 }],
    });
  });

  it('shows the backend shortage message when the order cannot be created', async () => {
    mockHappyPathGets();
    const user = userEvent.setup();
    renderWithClient(<OrderForm onSuccess={vi.fn()} />);

    await selectCustomerAndWarehouse(user);
    await pickProduct(user, 'silla', 'PT-1 — Silla de madera');
    await user.type(screen.getByLabelText('Cantidad línea 1'), '3');
    await user.type(screen.getByLabelText('Precio unitario línea 1'), '25');

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.reject(
          new ApiError(400, 'Stock insuficiente para completar este pedido'),
        );
      }
      if (path.startsWith('/customers'))
        return Promise.resolve(customersResponse([customer]));
      if (path.startsWith('/warehouses'))
        return Promise.resolve(warehousesResponse([warehouse]));
      if (path.startsWith('/products'))
        return Promise.resolve(productsResponse([chair, table]));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    expect(
      await screen.findByText('Stock insuficiente para completar este pedido'),
    ).toBeInTheDocument();
  });
});
