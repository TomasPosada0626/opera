import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { WarehouseRowActions } from './WarehouseRowActions';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Warehouse } from '../../types/inventory';

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

function buildWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'warehouse-1',
    name: 'Bodega principal',
    location: null,
    isActive: true,
    ...overrides,
  };
}

describe('WarehouseRowActions', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('calls onEdit when "Editar" is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithClient(
      <WarehouseRowActions warehouse={buildWarehouse()} onEdit={onEdit} />,
    );

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith(buildWarehouse());
  });

  it('hides the "Desactivar" button when the warehouse is already inactive', () => {
    renderWithClient(
      <WarehouseRowActions
        warehouse={buildWarehouse({ isActive: false })}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('calls PATCH /warehouses/:id/deactivate when "Desactivar" is clicked', async () => {
    mockedApiFetch.mockResolvedValue(buildWarehouse({ isActive: false }));
    const user = userEvent.setup();
    renderWithClient(
      <WarehouseRowActions warehouse={buildWarehouse()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/warehouses/warehouse-1/deactivate',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows an inline error when deactivating fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'La bodega tiene stock activo'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <WarehouseRowActions warehouse={buildWarehouse()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('La bodega tiene stock activo'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message when the failure is not an ApiError', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(
      <WarehouseRowActions warehouse={buildWarehouse()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No se pudo desactivar la bodega.'),
    ).toBeInTheDocument();
  });
});
