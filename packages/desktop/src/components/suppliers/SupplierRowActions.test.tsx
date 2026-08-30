import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SupplierRowActions } from './SupplierRowActions';
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
    name: 'Maderas del Norte',
    taxId: null,
    email: null,
    phone: null,
    address: null,
    isActive: true,
    ...overrides,
  };
}

describe('SupplierRowActions', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('calls onEdit when "Editar" is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithClient(
      <SupplierRowActions supplier={buildSupplier()} onEdit={onEdit} />,
    );

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith(buildSupplier());
  });

  it('hides the "Desactivar" button when the supplier is already inactive', () => {
    renderWithClient(
      <SupplierRowActions
        supplier={buildSupplier({ isActive: false })}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('calls PATCH /suppliers/:id/deactivate when "Desactivar" is clicked', async () => {
    mockedApiFetch.mockResolvedValue(buildSupplier({ isActive: false }));
    const user = userEvent.setup();
    renderWithClient(
      <SupplierRowActions supplier={buildSupplier()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/suppliers/supplier-1/deactivate',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows an inline error when deactivating fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'El proveedor tiene compras registradas'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <SupplierRowActions supplier={buildSupplier()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('El proveedor tiene compras registradas'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message when the failure is not an ApiError', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(
      <SupplierRowActions supplier={buildSupplier()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No se pudo desactivar el proveedor.'),
    ).toBeInTheDocument();
  });

  it('hides "Borrar datos" while the supplier is still active', () => {
    renderWithClient(
      <SupplierRowActions supplier={buildSupplier()} onEdit={vi.fn()} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Borrar datos' }),
    ).not.toBeInTheDocument();
  });

  it('opens a confirmation dialog instead of calling the API directly when "Borrar datos" is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <SupplierRowActions
        supplier={buildSupplier({ isActive: false })}
        onEdit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Borrar datos' }));

    expect(
      screen.getByRole('dialog', { name: 'Borrar datos personales' }),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('calls PATCH /suppliers/:id/anonymize only after confirming', async () => {
    mockedApiFetch.mockResolvedValue(
      buildSupplier({ isActive: false, name: 'Proveedor eliminado' }),
    );
    const user = userEvent.setup();
    renderWithClient(
      <SupplierRowActions
        supplier={buildSupplier({ isActive: false })}
        onEdit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Borrar datos' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/suppliers/supplier-1/anonymize',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('shows an inline error inside the dialog when anonymizing fails, without closing it', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(404, 'Proveedor no encontrado'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <SupplierRowActions
        supplier={buildSupplier({ isActive: false })}
        onEdit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Borrar datos' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    expect(
      await screen.findByText('Proveedor no encontrado'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
