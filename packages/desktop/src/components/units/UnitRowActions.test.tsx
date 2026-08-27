import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { UnitRowActions } from './UnitRowActions';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Unit } from '../../types/product';

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

function buildUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unit-1',
    name: 'Unidad',
    abbreviation: 'un',
    isActive: true,
    ...overrides,
  };
}

describe('UnitRowActions', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('calls onEdit when "Editar" is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithClient(<UnitRowActions unit={buildUnit()} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith(buildUnit());
  });

  it('hides the "Desactivar" button when the unit is already inactive', () => {
    renderWithClient(
      <UnitRowActions unit={buildUnit({ isActive: false })} onEdit={vi.fn()} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('calls PATCH /units/:id/deactivate when "Desactivar" is clicked', async () => {
    mockedApiFetch.mockResolvedValue(buildUnit({ isActive: false }));
    const user = userEvent.setup();
    renderWithClient(<UnitRowActions unit={buildUnit()} onEdit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/units/unit-1/deactivate',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows an inline error when deactivating fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'La unidad está en uso por productos activos'),
    );
    const user = userEvent.setup();
    renderWithClient(<UnitRowActions unit={buildUnit()} onEdit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('La unidad está en uso por productos activos'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message when the failure is not an ApiError', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(<UnitRowActions unit={buildUnit()} onEdit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No se pudo desactivar la unidad.'),
    ).toBeInTheDocument();
  });
});
