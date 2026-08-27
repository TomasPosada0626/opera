import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SupplierForm } from './SupplierForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Supplier } from '../../types/supplier';

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

function buildSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'supplier-1',
    name: 'Maderas del Norte S.A.S.',
    taxId: '900987654-1',
    email: 'ventas@maderasnorte.com',
    phone: '3009876543',
    address: 'Calle 5 # 6-7',
    isActive: true,
    ...overrides,
  };
}

function findCall(method: string): [string, RequestInit] | undefined {
  return mockedApiFetch.mock.calls.find(
    (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === method,
  ) as [string, RequestInit] | undefined;
}

describe('SupplierForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('requires a name of at least 2 characters', async () => {
    const user = userEvent.setup();
    renderWithClient(<SupplierForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText('Nombre'), 'A');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    expect(await screen.findByText('Ingresa un nombre')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid email but allows an empty one', async () => {
    const user = userEvent.setup();
    renderWithClient(<SupplierForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText('Nombre'), 'Proveedor Nuevo');
    await user.type(screen.getByLabelText('Correo (opcional)'), 'no-es-correo');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    expect(await screen.findByText('Correo inválido')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('creates a supplier, sending optional blanks as undefined', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'supplier-2' });
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<SupplierForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Nombre'), 'Proveedor Nuevo');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findCall('POST');
    expect(postCall?.[0]).toBe('/suppliers');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      name: 'Proveedor Nuevo',
      taxId: undefined,
      email: undefined,
      phone: undefined,
      address: undefined,
    });
  });

  it('pre-fills the form and updates an existing supplier', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'supplier-1' });
    const supplier = buildSupplier();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(
      <SupplierForm supplier={supplier} onSuccess={onSuccess} />,
    );

    expect(screen.getByLabelText('Nombre')).toHaveValue(supplier.name);
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Teléfono (opcional)'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const patchCall = findCall('PATCH');
    expect(patchCall?.[0]).toBe(`/suppliers/${supplier.id}`);
    const patchBody = JSON.parse(patchCall?.[1].body as string) as Record<
      string,
      unknown
    >;
    expect(patchBody.name).toBe(supplier.name);
    expect(patchBody).not.toHaveProperty('phone');
  });

  it('shows a generic error message when saving fails with a non-API error', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(<SupplierForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText('Nombre'), 'Proveedor Nuevo');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    expect(
      await screen.findByText(
        'No se pudo guardar el proveedor. Intenta de nuevo.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the backend error message when the API rejects the request', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError(409, 'El nombre ya existe'));
    const user = userEvent.setup();
    renderWithClient(<SupplierForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText('Nombre'), 'Proveedor Nuevo');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    expect(await screen.findByText('El nombre ya existe')).toBeInTheDocument();
  });
});
