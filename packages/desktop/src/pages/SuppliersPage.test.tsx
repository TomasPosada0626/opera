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
import SuppliersPage from './SuppliersPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { PaginatedResult } from '../types/product';
import type { Supplier } from '../types/supplier';

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

function buildSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'supplier-1',
    name: 'Maderas del Norte S.A.S.',
    taxId: '800987654-2',
    email: 'ventas@maderasdelnorte.test',
    phone: '3009876543',
    address: null,
    isActive: true,
    ...overrides,
  };
}

function suppliersResponse(data: Supplier[]): PaginatedResult<Supplier> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('SuppliersPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per supplier', async () => {
    mockedApiFetch.mockResolvedValue(suppliersResponse([buildSupplier()]));

    renderWithClient(<SuppliersPage />);

    expect(
      await screen.findByText('Maderas del Norte S.A.S.'),
    ).toBeInTheDocument();
    expect(screen.getByText('800987654-2')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('links each row to its detail page', async () => {
    mockedApiFetch.mockResolvedValue(suppliersResponse([buildSupplier()]));

    renderWithClient(<SuppliersPage />);

    const link = await screen.findByRole('link', { name: /Ver detalle/ });
    expect(link).toHaveAttribute('href', '/proveedores/supplier-1');
  });

  it('shows the empty message when there are no suppliers', async () => {
    mockedApiFetch.mockResolvedValue(suppliersResponse([]));

    renderWithClient(<SuppliersPage />);

    expect(
      await screen.findByText('No se encontraron proveedores.'),
    ).toBeInTheDocument();
  });

  it('shows a dash for optional fields left empty, and an Inactivo badge', async () => {
    mockedApiFetch.mockResolvedValue(
      suppliersResponse([
        buildSupplier({ taxId: null, email: null, isActive: false }),
      ]),
    );

    renderWithClient(<SuppliersPage />);

    await screen.findByText('Maderas del Norte S.A.S.');
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('hides "Nuevo proveedor" and row actions for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(suppliersResponse([buildSupplier()]));

    renderWithClient(<SuppliersPage />);

    await screen.findByText('Maderas del Norte S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Nuevo proveedor' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
  });

  it('shows "Nuevo proveedor" and row actions for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(suppliersResponse([buildSupplier()]));

    renderWithClient(<SuppliersPage />);

    expect(
      await screen.findByRole('button', { name: 'Nuevo proveedor' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desactivar' }),
    ).toBeInTheDocument();
  });

  it('does not offer "Desactivar" for an already inactive supplier', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(
      suppliersResponse([buildSupplier({ isActive: false })]),
    );

    renderWithClient(<SuppliersPage />);

    await screen.findByRole('button', { name: 'Editar' });
    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal when "Nuevo proveedor" is clicked', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(suppliersResponse([]));

    renderWithClient(<SuppliersPage />);

    const button = await screen.findByRole('button', {
      name: 'Nuevo proveedor',
    });
    button.click();

    expect(
      await screen.findByRole('dialog', { name: 'Nuevo proveedor' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear proveedor' }),
    ).toBeInTheDocument();
  });

  it('opens the edit modal pre-filled with the selected supplier', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(suppliersResponse([buildSupplier()]));
    const user = userEvent.setup();

    renderWithClient(<SuppliersPage />);

    const editButton = await screen.findByRole('button', { name: 'Editar' });
    await user.click(editButton);

    expect(
      await screen.findByRole('dialog', { name: 'Editar proveedor' }),
    ).toBeInTheDocument();
    const nameInput: HTMLInputElement = screen.getByLabelText('Nombre');
    expect(nameInput.value).toBe('Maderas del Norte S.A.S.');
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument();
  });

  it('sends the debounced search term as a query param', async () => {
    mockedApiFetch.mockResolvedValue(suppliersResponse([]));
    const user = userEvent.setup();

    renderWithClient(<SuppliersPage />);

    await user.type(screen.getByPlaceholderText('Buscar por nombre…'), 'norte');

    await waitFor(
      () => {
        const matched = mockedApiFetch.mock.calls.some((call: unknown[]) => {
          const path = call[0] as string;
          return (
            path.startsWith('/suppliers?') && path.includes('search=norte')
          );
        });
        expect(matched).toBe(true);
      },
      { timeout: 2000 },
    );
  });
});
