import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PurchaseOrderForm } from './PurchaseOrderForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import { buildPurchaseOrder, paginated } from '../../test/factories';
import type { Product } from '../../types/product';

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

const steel: Product = {
  id: 'product-1',
  sku: 'MP-ACR-18',
  name: 'Lámina de acero',
  type: 'RAW_MATERIAL',
  category: { id: 'cat-1', name: 'Materia prima', isActive: true },
  unit: { id: 'unit-1', name: 'Kilogramo', abbreviation: 'kg', isActive: true },
  minStock: null,
  maxStock: null,
  finish: null,
  material: null,
  size: null,
  isActive: true,
};
const screws: Product = {
  ...steel,
  id: 'product-2',
  sku: 'MP-TOR',
  name: 'Tornillo 4x16',
};

const suppliers = [
  { id: 'supplier-1', name: 'Aceros S.A.', isActive: true },
  { id: 'supplier-2', name: 'Inactivo Ltda.', isActive: false },
];

function mockGets() {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (options?.method === 'POST' && path === '/purchase-orders') {
      return Promise.resolve(buildPurchaseOrder());
    }
    if (options?.method) {
      return Promise.reject(new Error(`Unexpected write: ${path}`));
    }
    if (path.startsWith('/suppliers')) {
      return Promise.resolve(paginated(suppliers));
    }
    if (path.startsWith('/supplier-products')) {
      return Promise.resolve(
        paginated([
          {
            id: 'sp-1',
            price: '6800.0000',
            product: { id: steel.id, sku: steel.sku, name: steel.name },
            createdAt: '',
            updatedAt: '',
          },
        ]),
      );
    }
    if (path.startsWith('/warehouses')) {
      return Promise.resolve(
        paginated([
          {
            id: 'warehouse-1',
            name: 'Bodega principal',
            location: null,
            isActive: true,
          },
          {
            id: 'warehouse-2',
            name: 'Bodega 2',
            location: null,
            isActive: true,
          },
        ]),
      );
    }
    if (path.startsWith('/products')) {
      return Promise.resolve(paginated([steel, screws]));
    }
    return Promise.reject(new Error(`Unexpected GET: ${path}`));
  });
}

function postBody(): Record<string, unknown> {
  const call = mockedApiFetch.mock.calls.find(
    (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit];
  return JSON.parse(call[1].body as string) as Record<string, unknown>;
}

async function pickWarehouse(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Bodega principal' }),
    ).toBeInTheDocument(),
  );
  await user.selectOptions(screen.getByLabelText('Bodega'), 'warehouse-1');
}

async function pickProduct(
  user: ReturnType<typeof userEvent.setup>,
  line: number,
  optionText: string,
) {
  await user.type(
    screen.getByLabelText(`Producto línea ${line}`),
    optionText.slice(0, 4),
  );
  await user.click(
    await screen.findByRole('button', { name: new RegExp(optionText) }),
  );
}

describe('PurchaseOrderForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockGets();
  });

  it('requires a supplier and a warehouse when none is preselected', async () => {
    const user = userEvent.setup();
    renderWithClient(<PurchaseOrderForm onSuccess={vi.fn()} />);

    await screen.findByRole('option', { name: 'Aceros S.A.' });
    expect(
      screen.queryByRole('option', { name: 'Inactivo Ltda.' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar compra/ }));

    expect(
      await screen.findByText('Selecciona un proveedor'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Selecciona una bodega', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('fills the cost from the supplier price list and registers the purchase', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <PurchaseOrderForm supplierId="supplier-1" onSuccess={onSuccess} />,
    );

    // Con el proveedor fijo no se muestra el selector de proveedor.
    expect(screen.queryByLabelText('Proveedor')).not.toBeInTheDocument();
    await pickWarehouse(user);
    await pickProduct(user, 1, 'Lámina de acero');
    await waitFor(() =>
      expect(screen.getByLabelText('Costo unitario línea 1')).toHaveValue(6800),
    );
    await user.type(screen.getByLabelText('Cantidad línea 1'), '10');

    await user.click(screen.getByRole('button', { name: /Agregar producto/ }));
    await pickProduct(user, 2, 'Tornillo 4x16');
    await user.type(screen.getByLabelText('Cantidad línea 2'), '100');
    await user.type(screen.getByLabelText('Costo unitario línea 2'), '45');
    expect(screen.getByText('$ 72.500')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Factura del proveedor/), ' FV-1 ');
    await user.type(screen.getByLabelText(/Fecha esperada/), '2026-11-04');
    await user.click(screen.getByRole('button', { name: /Registrar compra/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(postBody()).toEqual({
      supplierId: 'supplier-1',
      warehouseId: 'warehouse-1',
      items: [
        { productId: 'product-1', quantity: 10, unitCost: 6800 },
        { productId: 'product-2', quantity: 100, unitCost: 45 },
      ],
      expectedDate: '2026-11-04',
      supplierInvoice: 'FV-1',
    });
  });

  it('rejects incomplete lines and repeated products', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <PurchaseOrderForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );
    await pickWarehouse(user);

    await user.click(screen.getByRole('button', { name: /Registrar compra/ }));
    expect(
      await screen.findByText(/Completa producto, cantidad/),
    ).toBeInTheDocument();

    await pickProduct(user, 1, 'Tornillo 4x16');
    await user.type(screen.getByLabelText('Cantidad línea 1'), '1');
    await user.type(screen.getByLabelText('Costo unitario línea 1'), '1');
    await user.click(screen.getByRole('button', { name: /Agregar producto/ }));
    await pickProduct(user, 2, 'Tornillo 4x16');
    await user.type(screen.getByLabelText('Cantidad línea 2'), '2');
    await user.type(screen.getByLabelText('Costo unitario línea 2'), '1');
    await user.click(screen.getByRole('button', { name: /Registrar compra/ }));
    expect(await screen.findByText(/producto repetido/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quitar línea 2' }));
    expect(screen.queryByLabelText('Cantidad línea 2')).not.toBeInTheDocument();
  });

  it('records an advance, but not one larger than the purchase', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <PurchaseOrderForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );
    await pickWarehouse(user);
    await pickProduct(user, 1, 'Tornillo 4x16');
    await user.type(screen.getByLabelText('Cantidad línea 1'), '10');
    await user.type(screen.getByLabelText('Costo unitario línea 1'), '100');

    await user.click(
      screen.getByRole('checkbox', { name: /Registrar un anticipo/ }),
    );
    await user.type(screen.getByLabelText('Monto'), '5000');
    await user.click(screen.getByRole('button', { name: /Registrar compra/ }));
    expect(
      await screen.findByText(/El pago no puede superar/),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Monto'));
    await user.type(screen.getByLabelText('Monto'), '400');
    await user.click(screen.getByRole('button', { name: /Registrar compra/ }));

    await waitFor(() =>
      expect(postBody().initialPayment).toEqual(
        expect.objectContaining({ amount: 400, method: 'TRANSFERENCIA' }),
      ),
    );
  });

  it('shows the backend error', async () => {
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.reject(
          new ApiError(400, 'El proveedor está desactivado'),
        );
      }
      if (path.startsWith('/warehouses')) {
        return Promise.resolve(
          paginated([
            {
              id: 'warehouse-1',
              name: 'Bodega principal',
              location: null,
              isActive: true,
            },
            {
              id: 'warehouse-2',
              name: 'Bodega 2',
              location: null,
              isActive: true,
            },
          ]),
        );
      }
      if (path.startsWith('/products')) {
        return Promise.resolve(paginated([screws]));
      }
      return Promise.resolve(paginated([]));
    });
    const user = userEvent.setup();
    renderWithClient(
      <PurchaseOrderForm supplierId="supplier-1" onSuccess={vi.fn()} />,
    );
    await pickWarehouse(user);
    await pickProduct(user, 1, 'Tornillo 4x16');
    await user.type(screen.getByLabelText('Cantidad línea 1'), '1');
    await user.type(screen.getByLabelText('Costo unitario línea 1'), '1');
    await user.click(screen.getByRole('button', { name: /Registrar compra/ }));

    expect(
      await screen.findByText('El proveedor está desactivado'),
    ).toBeInTheDocument();
  });
});
