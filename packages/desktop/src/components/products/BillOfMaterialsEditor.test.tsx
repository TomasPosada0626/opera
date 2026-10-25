import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BillOfMaterialsEditor } from './BillOfMaterialsEditor';
import { apiFetch, ApiError } from '../../lib/api-client';
import { paginated } from '../../test/factories';
import type { Product } from '../../types/product';
import type { BillOfMaterials } from '../../types/production';

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

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'chair',
    sku: 'PT-1',
    name: 'Silla',
    type: 'FINISHED_GOOD',
    category: { id: 'c', name: 'Muebles', isActive: true },
    unit: { id: 'u', name: 'Unidad', abbreviation: 'un', isActive: true },
    minStock: null,
    maxStock: null,
    finish: null,
    material: null,
    size: null,
    isActive: true,
    ...overrides,
  };
}

const wood = buildProduct({
  id: 'wood',
  sku: 'MP-1',
  name: 'Tabla de roble',
  type: 'RAW_MATERIAL',
  unit: { id: 'm', name: 'Metro', abbreviation: 'm', isActive: true },
});
const otherChair = buildProduct({ id: 'chair-2', name: 'Silla alta' });

function mockApi(bom: BillOfMaterials) {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (options?.method === 'PUT' || options?.method === 'DELETE') {
      return Promise.resolve(bom);
    }
    if (path.includes('/bill-of-materials')) return Promise.resolve(bom);
    if (path.startsWith('/products')) {
      return Promise.resolve(paginated([wood, otherChair]));
    }
    return Promise.reject(new Error(`Unexpected: ${path}`));
  });
}

const emptyBom: BillOfMaterials = {
  id: null,
  productId: 'chair',
  isActive: false,
  items: [],
};

const savedBom: BillOfMaterials = {
  id: 'bom-1',
  productId: 'chair',
  isActive: true,
  items: [
    {
      id: 'line-1',
      componentId: 'wood',
      quantity: '3.000',
      component: {
        id: 'wood',
        sku: 'MP-1',
        name: 'Tabla de roble',
        type: 'RAW_MATERIAL',
        unit: { id: 'm', name: 'Metro', abbreviation: 'm' },
      },
    },
  ],
};

describe('BillOfMaterialsEditor', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('starts with one empty line for a product without a list, and validates before saving', async () => {
    mockApi(emptyBom);
    const user = userEvent.setup();
    renderWithClient(
      <BillOfMaterialsEditor product={buildProduct()} onDone={vi.fn()} />,
    );

    await user.click(
      await screen.findByRole('button', {
        name: /Guardar lista de materiales/,
      }),
    );

    expect(screen.getByText(/Elige el material/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Quitar lista/ }),
    ).not.toBeInTheDocument();
  });

  it('only offers raw materials and supplies, then saves the full list', async () => {
    mockApi(emptyBom);
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <BillOfMaterialsEditor product={buildProduct()} onDone={onDone} />,
    );

    await user.type(
      await screen.findByLabelText('Buscar material línea 1'),
      'tabla',
    );
    await user.click(
      await screen.findByRole('button', { name: /MP-1 — Tabla de roble/ }),
    );
    expect(screen.queryByText(/Silla alta/)).not.toBeInTheDocument();
    expect(screen.getByText('m')).toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Cantidad por unidad línea 1'),
      '2.5',
    );
    await user.click(
      screen.getByRole('button', { name: /Guardar lista de materiales/ }),
    );

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const put = mockedApiFetch.mock.calls.find(
      (call: unknown[]) =>
        (call[1] as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit];
    expect(put[0]).toBe('/products/chair/bill-of-materials');
    expect(JSON.parse(put[1].body as string)).toEqual({
      items: [{ componentId: 'wood', quantity: 2.5 }],
    });
  });

  it('loads a saved list, lets the user change a line, and removes the whole list', async () => {
    mockApi(savedBom);
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <BillOfMaterialsEditor product={buildProduct()} onDone={onDone} />,
    );

    expect(await screen.findByText(/Tabla de roble/)).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad por unidad línea 1')).toHaveValue(3);

    await user.click(screen.getByRole('button', { name: 'Agregar material' }));
    expect(
      screen.getByLabelText('Buscar material línea 2'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar línea 2' }));

    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(
      screen.getByLabelText('Buscar material línea 1'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Quitar lista/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/products/chair/bill-of-materials',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('asks for at least one material when every line was removed', async () => {
    mockApi(emptyBom);
    const user = userEvent.setup();
    renderWithClient(
      <BillOfMaterialsEditor product={buildProduct()} onDone={vi.fn()} />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Quitar línea 1' }),
    );
    await user.click(
      screen.getByRole('button', { name: /Guardar lista de materiales/ }),
    );

    expect(
      screen.getByText('Agrega al menos un material.'),
    ).toBeInTheDocument();
  });

  it('shows the backend error when saving fails', async () => {
    mockApi(savedBom);
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) =>
      options?.method === 'PUT'
        ? Promise.reject(new ApiError(400, 'Tabla de roble está desactivado'))
        : Promise.resolve(
            path.includes('/bill-of-materials') ? savedBom : paginated([]),
          ),
    );
    const user = userEvent.setup();
    renderWithClient(
      <BillOfMaterialsEditor product={buildProduct()} onDone={vi.fn()} />,
    );

    await user.click(
      await screen.findByRole('button', {
        name: /Guardar lista de materiales/,
      }),
    );

    expect(
      await screen.findByText('Tabla de roble está desactivado'),
    ).toBeInTheDocument();
  });
});
