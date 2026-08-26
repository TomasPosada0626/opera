import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import CustomersPage from './CustomersPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { PaginatedResult } from '../types/product';
import type { Customer } from '../types/customer';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// header.payload.signature — solo el payload importa, decodeJwtPayload no
// verifica la firma (ver current-user.ts).
function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles,
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    name: 'Muebles del Valle S.A.S.',
    taxId: '900123456-1',
    email: 'compras@mueblesdelvalle.test',
    phone: '3001234567',
    address: null,
    isActive: true,
    ...overrides,
  };
}

function customersResponse(data: Customer[]): PaginatedResult<Customer> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('CustomersPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per customer', async () => {
    mockedApiFetch.mockResolvedValue(customersResponse([buildCustomer()]));

    renderWithClient(<CustomersPage />);

    expect(
      await screen.findByText('Muebles del Valle S.A.S.'),
    ).toBeInTheDocument();
    expect(screen.getByText('900123456-1')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('links each row to its detail page', async () => {
    mockedApiFetch.mockResolvedValue(customersResponse([buildCustomer()]));

    renderWithClient(<CustomersPage />);

    const link = await screen.findByRole('link', { name: /Ver detalle/ });
    expect(link).toHaveAttribute('href', '/clientes/customer-1');
  });

  it('shows the empty message when there are no customers', async () => {
    mockedApiFetch.mockResolvedValue(customersResponse([]));

    renderWithClient(<CustomersPage />);

    expect(
      await screen.findByText('No se encontraron clientes.'),
    ).toBeInTheDocument();
  });

  it('shows a dash for optional fields left empty, and an Inactivo badge', async () => {
    mockedApiFetch.mockResolvedValue(
      customersResponse([
        buildCustomer({ taxId: null, email: null, isActive: false }),
      ]),
    );

    renderWithClient(<CustomersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('hides "Nuevo cliente" and row actions for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(customersResponse([buildCustomer()]));

    renderWithClient(<CustomersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Nuevo cliente' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
  });

  it('shows "Nuevo cliente" and row actions for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(customersResponse([buildCustomer()]));

    renderWithClient(<CustomersPage />);

    expect(
      await screen.findByRole('button', { name: 'Nuevo cliente' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desactivar' }),
    ).toBeInTheDocument();
  });

  it('does not offer "Desactivar" for an already inactive customer', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(
      customersResponse([buildCustomer({ isActive: false })]),
    );

    renderWithClient(<CustomersPage />);

    await screen.findByRole('button', { name: 'Editar' });
    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal when "Nuevo cliente" is clicked', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(customersResponse([]));

    renderWithClient(<CustomersPage />);

    const button = await screen.findByRole('button', {
      name: 'Nuevo cliente',
    });
    button.click();

    expect(
      await screen.findByRole('dialog', { name: 'Nuevo cliente' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear cliente' }),
    ).toBeInTheDocument();
  });

  it('opens the edit modal pre-filled with the selected customer', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(customersResponse([buildCustomer()]));
    const user = userEvent.setup();

    renderWithClient(<CustomersPage />);

    const editButton = await screen.findByRole('button', { name: 'Editar' });
    await user.click(editButton);

    expect(
      await screen.findByRole('dialog', { name: 'Editar cliente' }),
    ).toBeInTheDocument();
    const nameInput: HTMLInputElement = screen.getByLabelText('Nombre');
    expect(nameInput.value).toBe('Muebles del Valle S.A.S.');
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument();
  });

  it('sends the debounced search term as a query param', async () => {
    mockedApiFetch.mockResolvedValue(customersResponse([]));
    const user = userEvent.setup();

    renderWithClient(<CustomersPage />);

    await user.type(screen.getByPlaceholderText('Buscar por nombre…'), 'valle');

    await waitFor(
      () => {
        const matched = mockedApiFetch.mock.calls.some((call: unknown[]) => {
          const path = call[0] as string;
          return (
            path.startsWith('/customers?') && path.includes('search=valle')
          );
        });
        expect(matched).toBe(true);
      },
      { timeout: 2000 },
    );
  });
});
