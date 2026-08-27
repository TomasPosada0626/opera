import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CategoryRowActions } from './CategoryRowActions';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Category } from '../../types/product';

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

function buildCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'category-1', name: 'Maderas', isActive: true, ...overrides };
}

describe('CategoryRowActions', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('calls onEdit when "Editar" is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithClient(
      <CategoryRowActions category={buildCategory()} onEdit={onEdit} />,
    );

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith(buildCategory());
  });

  it('hides the "Desactivar" button when the category is already inactive', () => {
    renderWithClient(
      <CategoryRowActions
        category={buildCategory({ isActive: false })}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('calls PATCH /categories/:id/deactivate when "Desactivar" is clicked', async () => {
    mockedApiFetch.mockResolvedValue(buildCategory({ isActive: false }));
    const user = userEvent.setup();
    renderWithClient(
      <CategoryRowActions category={buildCategory()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/categories/category-1/deactivate',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows an inline error when deactivating fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'La categoría tiene productos activos asociados'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <CategoryRowActions category={buildCategory()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('La categoría tiene productos activos asociados'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message when the failure is not an ApiError', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(
      <CategoryRowActions category={buildCategory()} onEdit={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No se pudo desactivar la categoría.'),
    ).toBeInTheDocument();
  });
});
