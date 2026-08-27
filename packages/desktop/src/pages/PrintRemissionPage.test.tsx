import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PrintRemissionPage from './PrintRemissionPage';
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
          product: { id: 'product-1', sku: 'SKU-1', name: 'Silla de madera' },
        },
      },
    ],
    paymentStatus: 'CARTERA',
    amountPaid: null,
    voidedAt: null,
    voidReason: null,
    order: {
      id: 'order-1',
      customer: { id: 'customer-1', name: 'Muebles del Valle' },
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

    expect(
      await screen.findByText('SKU-1 — Silla de madera'),
    ).toBeInTheDocument();
    expect(screen.getByText('Muebles del Valle')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Imprimir' }),
    ).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/remissions/remission-1');
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
    expect(
      await screen.findByText('SKU-1 — Silla de madera'),
    ).toBeInTheDocument();
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
      await screen.findByText('No existe la remisión No. 999'),
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
