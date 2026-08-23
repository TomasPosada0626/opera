import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ProductPicker } from './ProductPicker';
import { apiFetch } from '../../lib/api-client';
import type { PaginatedResult, Product } from '../../types/product';

vi.mock('../../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

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
    id: 'product-1',
    sku: 'SKU-1',
    name: 'Tornillo 1/4',
    type: 'RAW_MATERIAL',
    category: { id: 'cat-1', name: 'Ferretería', isActive: true },
    unit: { id: 'unit-1', name: 'Unidad', abbreviation: 'un', isActive: true },
    minStock: null,
    maxStock: null,
    finish: null,
    material: null,
    size: null,
    isActive: true,
    ...overrides,
  };
}

function productsResponse(data: Product[]): PaginatedResult<Product> {
  return {
    data,
    meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
  };
}

describe('ProductPicker', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows the selected product and a "Cambiar" action instead of the search input', () => {
    renderWithClient(
      <ProductPicker value={buildProduct()} onChange={vi.fn()} />,
    );

    expect(screen.getByText('SKU-1 — Tornillo 1/4')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Buscar producto por nombre o SKU…'),
    ).not.toBeInTheDocument();
  });

  it('searches and lists matching products as the user types', async () => {
    mockedApiFetch.mockResolvedValue(productsResponse([buildProduct()]));
    const user = userEvent.setup();

    renderWithClient(<ProductPicker value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
      'tornillo',
    );

    expect(await screen.findByText('SKU-1 — Tornillo 1/4')).toBeInTheDocument();
  });

  it('calls onChange with the selected product and clears the search', async () => {
    mockedApiFetch.mockResolvedValue(productsResponse([buildProduct()]));
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithClient(<ProductPicker value={null} onChange={onChange} />);

    const input = screen.getByPlaceholderText(
      'Buscar producto por nombre o SKU…',
    );
    await user.type(input, 'tornillo');
    await user.click(await screen.findByText('SKU-1 — Tornillo 1/4'));

    expect(onChange).toHaveBeenCalledWith(buildProduct());
  });

  it('clears the selection when "Cambiar" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(
      <ProductPicker value={buildProduct()} onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Cambiar' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the descriptive attributes next to the selected product', () => {
    renderWithClient(
      <ProductPicker
        value={buildProduct({
          finish: 'Natural',
          material: 'Roble',
          size: 'Grande',
        })}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('SKU-1 — Tornillo 1/4 (Natural, Roble, Grande)'),
    ).toBeInTheDocument();
  });

  it('shows only the attributes that are set, in search results', async () => {
    mockedApiFetch.mockResolvedValue(
      productsResponse([buildProduct({ material: 'Roble' })]),
    );
    const user = userEvent.setup();

    renderWithClient(<ProductPicker value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Buscar producto por nombre o SKU…'),
      'tornillo',
    );

    expect(
      await screen.findByText('SKU-1 — Tornillo 1/4 (Roble)'),
    ).toBeInTheDocument();
  });

  it('shows an inline error message when provided', () => {
    renderWithClient(
      <ProductPicker
        value={null}
        onChange={vi.fn()}
        error="Selecciona un producto"
      />,
    );

    expect(screen.getByText('Selecciona un producto')).toBeInTheDocument();
  });
});
