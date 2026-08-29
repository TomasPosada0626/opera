import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { GlobalSearch } from './GlobalSearch';
import { apiFetch } from '../../lib/api-client';
import type { GlobalSearchResult } from '../../types/search';

vi.mock('../../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithRouter(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={ui} />
          <Route
            path="/clientes/:customerId"
            element={<div>Customer detail page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function buildResult(
  overrides: Partial<GlobalSearchResult> = {},
): GlobalSearchResult {
  return {
    products: [],
    customers: [],
    suppliers: [],
    remissions: [],
    productionOrders: [],
    ...overrides,
  };
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('does not query until at least 2 characters are typed', async () => {
    mockedApiFetch.mockResolvedValue(buildResult());
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearch />);

    await user.type(screen.getByPlaceholderText(/Buscar productos/), 's');

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('shows grouped results after the debounced term resolves', async () => {
    mockedApiFetch.mockResolvedValue(
      buildResult({
        customers: [{ id: 'customer-1', name: 'Muebles del Valle' }],
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearch />);

    await user.type(screen.getByPlaceholderText(/Buscar productos/), 'valle');

    await waitFor(
      () => {
        expect(screen.getByText('Muebles del Valle')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    expect(screen.getByText('Clientes')).toBeInTheDocument();
  });

  it('navigates to the result and clears the search on click', async () => {
    mockedApiFetch.mockResolvedValue(
      buildResult({
        customers: [{ id: 'customer-1', name: 'Muebles del Valle' }],
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearch />);

    const input = screen.getByPlaceholderText(/Buscar productos/);
    await user.type(input, 'valle');

    const result = await screen.findByText(
      'Muebles del Valle',
      {},
      { timeout: 2000 },
    );
    await user.click(result);

    expect(await screen.findByText('Customer detail page')).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('shows an empty-results message when nothing matches', async () => {
    mockedApiFetch.mockResolvedValue(buildResult());
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearch />);

    await user.type(screen.getByPlaceholderText(/Buscar productos/), 'zzz');

    await waitFor(
      () => {
        expect(screen.getByText(/Sin resultados/)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('shows a loading message while the query is in flight', async () => {
    let resolveFetch!: (value: GlobalSearchResult) => void;
    mockedApiFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearch />);

    await user.type(screen.getByPlaceholderText(/Buscar productos/), 'valle');

    await waitFor(
      () => {
        expect(screen.getByText('Buscando…')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    resolveFetch(buildResult());
  });

  it('closes the dropdown when Escape is pressed', async () => {
    mockedApiFetch.mockResolvedValue(
      buildResult({
        customers: [{ id: 'customer-1', name: 'Muebles del Valle' }],
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearch />);
    const input = screen.getByPlaceholderText(/Buscar productos/);
    await user.type(input, 'valle');
    await screen.findByText('Muebles del Valle', {}, { timeout: 2000 });

    await user.keyboard('{Escape}');

    expect(screen.queryByText('Muebles del Valle')).not.toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside', async () => {
    mockedApiFetch.mockResolvedValue(
      buildResult({
        customers: [{ id: 'customer-1', name: 'Muebles del Valle' }],
      }),
    );
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <div>
            <button type="button">Fuera del buscador</button>
            <GlobalSearch />
          </div>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = screen.getByPlaceholderText(/Buscar productos/);
    await user.type(input, 'valle');
    await screen.findByText('Muebles del Valle', {}, { timeout: 2000 });

    await user.click(
      screen.getByRole('button', { name: 'Fuera del buscador' }),
    );

    expect(screen.queryByText('Muebles del Valle')).not.toBeInTheDocument();
  });

  it('shows the production-order group with its status as a sublabel', async () => {
    mockedApiFetch.mockResolvedValue(
      buildResult({
        productionOrders: [
          {
            id: 'order-1',
            product: { id: 'product-1', sku: 'PT-1', name: 'Silla de madera' },
            status: 'EN_PROCESO',
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<GlobalSearch />);

    await user.type(screen.getByPlaceholderText(/Buscar productos/), 'silla');

    await waitFor(
      () => {
        expect(screen.getByText('PT-1 — Silla de madera')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    expect(screen.getByText('Órdenes de producción')).toBeInTheDocument();
    expect(screen.getByText('En proceso')).toBeInTheDocument();
  });
});
