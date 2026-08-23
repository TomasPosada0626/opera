import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CustomerPicker } from './CustomerPicker';
import { apiFetch } from '../../lib/api-client';
import type { Customer } from '../../types/customer';
import type { PaginatedResult } from '../../types/product';

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

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    name: 'Muebles del Valle S.A.S.',
    taxId: null,
    email: null,
    phone: null,
    address: null,
    isActive: true,
    ...overrides,
  };
}

function customersResponse(data: Customer[]): PaginatedResult<Customer> {
  return {
    data,
    meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
  };
}

describe('CustomerPicker', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows the selected customer and a "Cambiar" action instead of the search input', () => {
    renderWithClient(
      <CustomerPicker value={buildCustomer()} onChange={vi.fn()} />,
    );

    expect(screen.getByText('Muebles del Valle S.A.S.')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Buscar cliente por nombre…'),
    ).not.toBeInTheDocument();
  });

  it('searches and lists matching customers as the user types', async () => {
    mockedApiFetch.mockResolvedValue(customersResponse([buildCustomer()]));
    const user = userEvent.setup();

    renderWithClient(<CustomerPicker value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Buscar cliente por nombre…'),
      'Muebles',
    );

    expect(
      await screen.findByText('Muebles del Valle S.A.S.'),
    ).toBeInTheDocument();
  });

  it('calls onChange with the selected customer and clears the search', async () => {
    mockedApiFetch.mockResolvedValue(customersResponse([buildCustomer()]));
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithClient(<CustomerPicker value={null} onChange={onChange} />);

    await user.type(
      screen.getByPlaceholderText('Buscar cliente por nombre…'),
      'Muebles',
    );
    await user.click(await screen.findByText('Muebles del Valle S.A.S.'));

    expect(onChange).toHaveBeenCalledWith(buildCustomer());
  });

  it('clears the selection when "Cambiar" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(
      <CustomerPicker value={buildCustomer()} onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Cambiar' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers to create a customer with just the typed name when there are no matches', async () => {
    mockedApiFetch.mockResolvedValue(customersResponse([]));
    const user = userEvent.setup();

    renderWithClient(<CustomerPicker value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Buscar cliente por nombre…'),
      'Cliente nuevo',
    );

    expect(
      await screen.findByRole('button', {
        name: 'Crear cliente "Cliente nuevo"',
      }),
    ).toBeInTheDocument();
  });

  it('creates the customer and selects it when the create action is clicked', async () => {
    const created = buildCustomer({ id: 'customer-2', name: 'Cliente nuevo' });
    mockedApiFetch.mockImplementation(
      (_path: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          return Promise.resolve(created);
        }
        return Promise.resolve(customersResponse([]));
      },
    );
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithClient(<CustomerPicker value={null} onChange={onChange} />);

    await user.type(
      screen.getByPlaceholderText('Buscar cliente por nombre…'),
      'Cliente nuevo',
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Crear cliente "Cliente nuevo"',
      }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(created));
    const postCall = mockedApiFetch.mock.calls.find(
      (call: unknown[]) =>
        (call[1] as RequestInit | undefined)?.method === 'POST',
    ) as [string, RequestInit];
    expect(postCall[0]).toBe('/customers');
    expect(JSON.parse(postCall[1].body as string)).toEqual({
      name: 'Cliente nuevo',
    });
  });

  it('shows an inline error message when provided', () => {
    renderWithClient(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
        error="Selecciona o crea un cliente"
      />,
    );

    expect(
      screen.getByText('Selecciona o crea un cliente'),
    ).toBeInTheDocument();
  });
});
