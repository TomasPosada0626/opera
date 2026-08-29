import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DeleteSupplierProductAction } from './DeleteSupplierProductAction';
import { apiFetch, ApiError } from '../../lib/api-client';

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

describe('DeleteSupplierProductAction', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('does not call the API when "Eliminar" is clicked — opens a confirmation instead', async () => {
    const user = userEvent.setup();
    renderWithClient(<DeleteSupplierProductAction id="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(
      screen.getByRole('dialog', { name: 'Eliminar precio de proveedor' }),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('does nothing and closes the dialog when "Cancelar" is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(<DeleteSupplierProductAction id="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('calls DELETE /supplier-products/:id only after confirming', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithClient(<DeleteSupplierProductAction id="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/supplier-products/sp-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('shows an inline error inside the dialog when deletion fails, without closing it', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'El precio tiene compras registradas'),
    );
    const user = userEvent.setup();
    renderWithClient(<DeleteSupplierProductAction id="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    expect(
      await screen.findByText('El precio tiene compras registradas'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
