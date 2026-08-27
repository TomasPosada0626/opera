import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { WarehouseSelect } from './WarehouseSelect';
import { apiFetch } from '../../lib/api-client';
import type { PaginatedResult } from '../../types/product';
import type { Warehouse } from '../../types/inventory';

vi.mock('../../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function warehousesResponse(data: Warehouse[]): PaginatedResult<Warehouse> {
  return {
    data,
    meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 },
  };
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

// Formulario mínimo real (no un mock de react-hook-form) — WarehouseSelect
// depende de una `registration` de verdad y de que `onAutoSelect` de
// verdad termine actualizando el valor que finalmente se envía.
function Harness({
  onSubmit,
  forcedError,
}: {
  onSubmit: (warehouseId: string) => void;
  forcedError?: string;
}) {
  const { register, handleSubmit, setValue } = useForm<{
    warehouseId: string;
  }>({ defaultValues: { warehouseId: '' } });

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((values) => onSubmit(values.warehouseId))(event)
      }
    >
      <WarehouseSelect
        registration={register('warehouseId')}
        error={
          forcedError ? { type: 'custom', message: forcedError } : undefined
        }
        onAutoSelect={(id) => setValue('warehouseId', id)}
      />
      <button type="submit">Enviar</button>
    </form>
  );
}

function renderHarness(
  onSubmit: (warehouseId: string) => void,
  forcedError?: string,
): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Harness onSubmit={onSubmit} forcedError={forcedError} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WarehouseSelect', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('auto-selects and hides the field when there is exactly one warehouse', async () => {
    mockedApiFetch.mockResolvedValue(warehousesResponse([buildWarehouse()]));
    const onSubmit = vi.fn();
    renderHarness(onSubmit);

    await waitFor(() =>
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('warehouse-1'));
  });

  it('shows a real select when there are two or more warehouses', async () => {
    mockedApiFetch.mockResolvedValue(
      warehousesResponse([
        buildWarehouse(),
        buildWarehouse({ id: 'warehouse-2', name: 'Bodega secundaria' }),
      ]),
    );
    renderHarness(vi.fn());

    await screen.findByLabelText('Bodega');
    expect(
      await screen.findByRole('option', { name: 'Bodega secundaria' }),
    ).toBeInTheDocument();
  });

  it('tells the user there are no warehouses yet, with a link to create one', async () => {
    mockedApiFetch.mockResolvedValue(warehousesResponse([]));
    renderHarness(vi.fn());

    expect(
      await screen.findByText(/No hay bodegas registradas/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'créala primero en Bodegas' }),
    ).toHaveAttribute('href', '/bodegas');
  });

  it('shows an error message when the warehouses query fails', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    renderHarness(vi.fn());

    expect(
      await screen.findByText(
        'No se pudieron cargar las bodegas. Intenta de nuevo.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the field validation error passed in from the parent form', async () => {
    mockedApiFetch.mockResolvedValue(
      warehousesResponse([
        buildWarehouse(),
        buildWarehouse({ id: 'warehouse-2', name: 'Bodega secundaria' }),
      ]),
    );
    renderHarness(vi.fn(), 'Selecciona una bodega, por favor');

    expect(
      await screen.findByText('Selecciona una bodega, por favor'),
    ).toBeInTheDocument();
  });
});
