import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SupplierPurchaseForm } from './SupplierPurchaseForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { PaginatedResult, Product } from '../../types/product';

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

function productsResponse(data: Product[]): PaginatedResult<Product> {
  return {
    data,
    meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
  };
}

async function pickProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
    'pino',
  );
  await user.click(await screen.findByText('MP-1 — Tabla de pino'));
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
    // ProductPicker consulta /products apenas se monta (aunque el usuario
    // no haya escrito nada todavía) — sin resolver esto la query queda con
    // data undefined y React Query se queja.
    mockedApiFetch.mockResolvedValue(productsResponse([]));
    const user = userEvent.setup();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    expect(
      await screen.findByText('Selecciona un producto'),
    ).toBeInTheDocument();
    expect(findPostCall()).toBeUndefined();
  });

  it('requires quantity and unit cost greater than 0', async () => {
    mockedApiFetch.mockResolvedValue(productsResponse([product]));
    const user = userEvent.setup();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );

    await pickProduct(user);
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    expect(
      await screen.findByText('Ingresa una cantidad mayor a 0'),
    ).toBeInTheDocument();
  });

  it('submits the purchase without a date when left empty', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={onSuccess} />,
    );

    mockedApiFetch.mockResolvedValue(productsResponse([product]));
    await pickProduct(user);

    mockedApiFetch.mockImplementation(
      (_path: string, options?: RequestInit) => {
        if (options?.method === 'POST')
          return Promise.resolve({ id: 'purchase-1' });
        return Promise.resolve(productsResponse([product]));
      },
    );

    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.type(screen.getByLabelText('Costo unitario'), '4500');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(postCall?.[0]).toBe('/supplier-purchases');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      supplierId: 'supplier-1',
      productId: 'product-1',
      quantity: 10,
      unitCost: 4500,
      purchasedAt: undefined,
    });
  });

  it('shows the backend error message when saving fails', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <SupplierPurchaseForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );

    mockedApiFetch.mockResolvedValue(productsResponse([product]));
    await pickProduct(user);

    mockedApiFetch.mockRejectedValue(
      new ApiError(404, 'Producto no encontrado'),
    );
    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.type(screen.getByLabelText('Costo unitario'), '4500');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));

    expect(
      await screen.findByText('Producto no encontrado'),
    ).toBeInTheDocument();
  });
});
