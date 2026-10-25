import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import AuditPage from './AuditPage';
import { apiFetch } from '../lib/api-client';
import { paginated } from '../test/factories';
import type { AuditEntry } from '../types/audit';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const entries: AuditEntry[] = [
  {
    id: 'a1',
    entity: 'Order',
    entityId: '12345678-aaaa-4bbb-8ccc-dddddddddddd',
    action: 'UPDATE',
    before: { notes: 'vieja', estimatedDeliveryDate: null, updatedAt: 'x' },
    after: {
      notes: 'nueva',
      estimatedDeliveryDate: '2026-02-01',
      updatedAt: 'y',
      items: [
        {
          id: 'i1',
          quantity: '3',
          product: { name: 'Silla de roble macizo con acabado natural' },
        },
      ],
    },
    timestamp: '2026-01-20T15:00:00.000Z',
    user: { id: 'u1', name: 'Admin' },
  },
  {
    id: 'a2',
    entity: 'Remission',
    entityId: '87654321-aaaa-4bbb-8ccc-dddddddddddd',
    action: 'VOID',
    before: null,
    after: null,
    timestamp: '2026-01-21T15:00:00.000Z',
    user: { id: 'u1', name: 'Admin' },
  },
];

describe('AuditPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(paginated(entries));
  });

  it('lists who did what in plain language', async () => {
    renderPage();

    expect(await screen.findByText(/editó/)).toBeInTheDocument();
    expect(screen.getByText(/anuló/)).toBeInTheDocument();
    expect(screen.getByText('12345678')).toBeInTheDocument();
  });

  it('expands an entry to show only the fields that changed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /3 campos/ }));

    expect(screen.getByText('vieja')).toBeInTheDocument();
    expect(screen.getByText('nueva')).toBeInTheDocument();
    expect(screen.queryByText('updatedAt')).not.toBeInTheDocument();
    // Un valor largo se recorta.
    expect(screen.getByText(/…$/)).toBeInTheDocument();
  });

  it('filters by entity type and date range', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/editó/);
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Remission');
    await user.type(screen.getByLabelText('Desde'), '2026-01-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-01-31');

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /entity=Remission.*from=2026-01-01.*to=2026-02-01/,
        ),
      ),
    );
  });
});
