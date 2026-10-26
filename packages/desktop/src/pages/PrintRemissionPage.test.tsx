import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PrintRemissionPage from './PrintRemissionPage';
import { RETURNS_NOTICE } from '../components/orders/RemissionSheet';
import { apiFetch } from '../lib/api-client';
import type { RemissionDetail } from '../types/order';
import type { PaginatedResult } from '../types/product';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderAt(initialPath: string): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/imprimir-remision" element={<PrintRemissionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui);
}

function buildRemission(
  overrides: Partial<RemissionDetail> = {},
): RemissionDetail {
  return {
    id: 'remission-1',
    number: 42,
    createdAt: '2026-08-01T12:00:00.000Z',
    user: { id: 'user-1', name: 'Admin' },
    items: [
      {
        id: 'item-1',
        orderItemId: 'order-item-1',
        quantity: '4',
        orderItem: {
          id: 'order-item-1',
          unitPrice: '25',
          product: {
            id: 'product-1',
            sku: 'SKU-1',
            name: 'Silla de madera',
            material: 'Roble',
            finish: 'Natural',
            unit: { name: 'Unidad', abbreviation: 'und' },
          },
        },
      },
    ],
    subtotal: '100',
    vatAmount: '19',
    total: '119',
    amountPaid: '0',
    paymentStatus: 'CARTERA',
    voidedAt: null,
    voidReason: null,
    order: {
      id: 'order-1',
      number: 9,
      vatRate: '19',
      estimatedDeliveryDate: '2026-08-05T00:00:00.000Z',
      customer: {
        id: 'customer-1',
        name: 'Muebles del Valle',
        taxId: '900.123.456-7',
        email: null,
        phone: '604 444 5566',
        address: 'Cra 52 # 14-30',
        city: 'Medellín',
        country: 'Colombia',
        mobile: '310 555 1234',
        zone: 'Antioquia',
        salesRep: 'Carlos Pérez',
        paymentTerms: 'Crédito 30 días',
        isActive: true,
      },
      warehouse: { id: 'warehouse-1', name: 'Bodega principal' },
    },
    ...overrides,
  };
}

describe('PrintRemissionPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('loads and shows a remission linked directly by id', async () => {
    mockedApiFetch.mockResolvedValue(buildRemission());

    renderAt('/imprimir-remision?id=remission-1');

    expect(await screen.findAllByText('SKU-1 — Silla de madera')).toHaveLength(
      2,
    );
    expect(screen.getAllByText('Muebles del Valle')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Imprimir' }),
    ).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/remissions/remission-1');
  });

  // Herrajes Toro imprime una hoja carta y la corta por la mitad: la copia
  // del cliente arriba y la de la empresa abajo, con su formato en papel.
  it('prints both copies on one sheet with the paper format fields', async () => {
    mockedApiFetch.mockResolvedValue(buildRemission({ number: 3286 }));

    renderAt('/imprimir-remision?id=remission-1');

    const clientCopy = await screen.findByRole('region', {
      name: 'Copia del cliente',
    });
    const companyCopy = screen.getByRole('region', {
      name: 'Copia de la empresa',
    });
    for (const copy of [clientCopy, companyCopy]) {
      const view = within(copy);
      expect(view.getByText(/HT 3286/)).toBeInTheDocument();
      expect(view.getByText('Medellín')).toBeInTheDocument();
      expect(view.getByText('Crédito 30 días')).toBeInTheDocument();
      expect(view.getByText('Carlos Pérez')).toBeInTheDocument();
      expect(view.getByText('Unidad')).toBeInTheDocument();
      expect(view.getByText('IVA 19%')).toBeInTheDocument();
      expect(view.getByText(RETURNS_NOTICE)).toBeInTheDocument();
      // Solo 2 filas en blanco debajo de los productos, no el resto de la
      // plantilla: rellenar mandaba cada copia a su propia hoja.
      expect(copy.querySelectorAll('[data-empty-row]')).toHaveLength(2);
    }
    expect(document.querySelector('.remission-sheet')).toHaveAttribute(
      'data-layout',
      'half',
    );
  });

  // Si la copia no cabe en media hoja: primero sin filas en blanco y, solo
  // si tampoco, una hoja por copia (sin filas de relleno).
  it('drops the blank rows, then gives each copy its own sheet, when the copy overflows', async () => {
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(1000);
    try {
      mockedApiFetch.mockResolvedValue(buildRemission());

      renderAt('/imprimir-remision?id=remission-1');

      const clientCopy = await screen.findByRole('region', {
        name: 'Copia del cliente',
      });
      await waitFor(() =>
        expect(document.querySelector('.remission-sheet')).toHaveAttribute(
          'data-layout',
          'full',
        ),
      );
      expect(clientCopy.querySelectorAll('[data-empty-row]')).toHaveLength(2);
      expect(clientCopy).not.toHaveClass('remission-copy--cut');
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it('leaves the VAT cell empty for an order without VAT', async () => {
    mockedApiFetch.mockResolvedValue(
      buildRemission({
        vatAmount: '0',
        total: '100',
        order: { ...buildRemission().order, vatRate: '0' },
      }),
    );

    renderAt('/imprimir-remision?id=remission-1');

    const clientCopy = await screen.findByRole('region', {
      name: 'Copia del cliente',
    });
    expect(within(clientCopy).getByText('IVA')).toBeInTheDocument();
    expect(within(clientCopy).queryByText(/IVA \d/)).not.toBeInTheDocument();
  });

  it('shows nothing to print until a remission is chosen', () => {
    renderAt('/imprimir-remision');

    expect(
      screen.getByText(
        'Busca una remisión por su número para verla e imprimirla.',
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('finds a remission by number through the search box', async () => {
    const found = buildRemission({ id: 'remission-2', number: 7 });
    const paginated: PaginatedResult<RemissionDetail> = {
      data: [found],
      meta: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
    };
    mockedApiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/remissions?search') ? paginated : found,
      ),
    );

    renderAt('/imprimir-remision');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar remisión por número'), '7');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/remissions?search=7&pageSize=1',
      ),
    );
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/remissions/remission-2'),
    );
    expect(await screen.findAllByText('SKU-1 — Silla de madera')).toHaveLength(
      2,
    );
  });

  it('shows a not-found message when the search has no match', async () => {
    mockedApiFetch.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 1, total: 0, totalPages: 0 },
    } satisfies PaginatedResult<RemissionDetail>);

    renderAt('/imprimir-remision');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar remisión por número'), '999');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(
      await screen.findByText('No existe la remisión 999'),
    ).toBeInTheDocument();
  });

  it('warns when the remission being printed is voided', async () => {
    mockedApiFetch.mockResolvedValue(
      buildRemission({ voidedAt: '2026-08-02T00:00:00.000Z', voidReason: 'x' }),
    );

    renderAt('/imprimir-remision?id=remission-1');

    expect(
      await screen.findByText(/Esta remisión está anulada/),
    ).toBeInTheDocument();
  });
});
