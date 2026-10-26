import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import OrderDetailPage from './OrderDetailPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import { downloadFile } from '../lib/download-file';
import {
  buildOrder,
  buildPayment,
  buildRemission,
  fakeJwt,
} from '../test/factories';
import type { Order } from '../types/order';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
  ApiError: class ApiError extends Error {
    shortages = [];
  },
}));

vi.mock('../lib/download-file', () => ({
  downloadFile: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;
const mockedDownloadFile = downloadFile as unknown as Mock;

function renderOrder(order: Order | null) {
  mockedApiFetch.mockResolvedValue(order);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/pedidos/order-1']}>
        <Routes>
          <Route path="/pedidos/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ) as ReturnType<typeof render> & { ui?: ReactElement };
}

const warehousedOrder = buildOrder({
  status: 'EN_ALMACEN',
  productionStartedAt: '2026-01-16T10:00:00.000Z',
  warehousedAt: '2026-01-18T10:00:00.000Z',
  estimatedDeliveryDate: '2026-01-25T00:00:00.000Z',
  notes: 'Color nogal',
});

describe('OrderDetailPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedDownloadFile.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('shows the order number, customer, status and notes', async () => {
    renderOrder(warehousedOrder);

    expect(
      await screen.findByRole('heading', { name: 'Muebles del Valle S.A.S.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pedido #12')).toBeInTheDocument();
    expect(screen.getAllByText('En almacén').length).toBeGreaterThan(0);
    expect(screen.getByText('Color nogal')).toBeInTheDocument();
  });

  it('shows the four stations with how long each one took', async () => {
    renderOrder(warehousedOrder);

    const timeline = await screen.findByRole('list', {
      name: 'Estaciones del pedido',
    });
    expect(within(timeline).getByText('Pendiente')).toBeInTheDocument();
    expect(within(timeline).getByText('Despachado')).toBeInTheDocument();
    // Pendiente -> En producción: 1 día; En producción -> En almacén: 2 días.
    expect(within(timeline).getByText('Estuvo 1 día')).toBeInTheDocument();
    expect(within(timeline).getByText('Estuvo 2 días')).toBeInTheDocument();
    expect(within(timeline).getByText(/^Lleva /)).toBeInTheDocument();
  });

  it('says when nothing is found', async () => {
    renderOrder(null);

    expect(
      await screen.findByText('Pedido no encontrado.'),
    ).toBeInTheDocument();
  });

  it('renders order items with delivered so far and the order total', async () => {
    renderOrder(
      buildOrder({
        status: 'EN_ALMACEN',
        remissions: [
          buildRemission({ id: 'r1', number: 1 }),
          buildRemission({
            id: 'r2',
            number: 2,
            items: [{ id: 'ri-2', orderItemId: 'item-1', quantity: '1' }],
          }),
        ],
      }),
    );

    const row = (await screen.findByText('Silla de madera')).closest('tr')!;
    // 2 + 1 entregados de 3.
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText(/\/ 3/)).toBeInTheDocument();
    expect(screen.getByText('Total del pedido (sin IVA)')).toBeInTheDocument();
  });

  it('breaks the total into subtotal and VAT when the order has VAT', async () => {
    // 3 × 25 = 75; IVA 19 % = 14,25; total 89,25.
    renderOrder(buildOrder({ vatRate: '19' }));

    expect(await screen.findByText('IVA 19 %')).toBeInTheDocument();
    expect(screen.getByText('$ 14,25')).toBeInTheDocument();
    expect(screen.getAllByText('$ 89,25').length).toBeGreaterThan(0);
    expect(screen.getByText('Total del pedido')).toBeInTheDocument();
  });

  it('summarizes collection: dispatched, paid and pending', async () => {
    renderOrder(
      buildOrder({
        status: 'DESPACHADO',
        remissions: [
          buildRemission({
            total: '75',
            amountPaid: '25',
            paymentStatus: 'ABONADO',
            payments: [buildPayment()],
          }),
        ],
      }),
    );

    expect(await screen.findByText('Saldo pendiente')).toBeInTheDocument();
    expect(
      screen.getByText('33% cobrado de lo despachado'),
    ).toBeInTheDocument();
  });

  it('lists each remission with its payment status and its payments', async () => {
    renderOrder(
      buildOrder({
        status: 'EN_ALMACEN',
        remissions: [
          buildRemission({
            amountPaid: '25',
            paymentStatus: 'ABONADO',
            payments: [
              buildPayment({ note: 'Nequi' }),
              buildPayment({
                id: 'payment-2',
                amount: '10',
                voidedAt: '2026-01-22T10:00:00.000Z',
                voidReason: 'Rechazada',
              }),
            ],
          }),
        ],
      }),
    );

    expect((await screen.findAllByText('Abonado')).length).toBeGreaterThan(1);
    expect(screen.getByText('Nequi')).toBeInTheDocument();
    expect(screen.getByText('Anulado: Rechazada')).toBeInTheDocument();
  });

  it('shows "Anulada" with its reason for a voided remission', async () => {
    renderOrder(
      buildOrder({
        status: 'EN_ALMACEN',
        remissions: [
          buildRemission({
            voidedAt: '2026-01-21T10:00:00.000Z',
            voidReason: 'Cantidad equivocada',
          }),
        ],
      }),
    );

    expect(await screen.findByText('Anulada')).toBeInTheDocument();
    expect(screen.getByText('Motivo: Cantidad equivocada')).toBeInTheDocument();
  });

  it('downloads the remission PDF with a filename derived from its number', async () => {
    renderOrder(
      buildOrder({ status: 'EN_ALMACEN', remissions: [buildRemission()] }),
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /Descargar PDF/ }),
    );

    expect(mockedDownloadFile).toHaveBeenCalledWith(
      '/remissions/remission-1/pdf',
      'remision-HT-7.pdf',
    );
  });

  it('hides every admin action for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    renderOrder(
      buildOrder({ status: 'EN_ALMACEN', remissions: [buildRemission()] }),
    );

    await screen.findByText('HT 7');
    expect(
      screen.queryByRole('button', { name: /Nueva remisión/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Registrar abono/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Editar seguimiento/ }),
    ).not.toBeInTheDocument();
  });

  describe('as ADMIN', () => {
    beforeEach(() => {
      setAuthToken(fakeJwt(['ADMIN']));
    });

    it('opens and closes the remission modal with the pending quantity per line', async () => {
      renderOrder(warehousedOrder);
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', { name: /Nueva remisión/ }),
      );
      const dialog = screen.getByRole('dialog', { name: 'Nueva remisión' });
      expect(within(dialog).getByText(/Pendiente:/)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('only offers a new remission once the order is in the warehouse', async () => {
      renderOrder(buildOrder({ status: 'EN_PRODUCCION' }));

      await screen.findByText('Remisiones');
      expect(
        screen.queryByRole('button', { name: /Nueva remisión/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          'Se puede despachar cuando el pedido llegue a almacén.',
        ),
      ).toBeInTheDocument();
    });

    it('opens the payment modal for a remission with a pending balance', async () => {
      renderOrder(
        buildOrder({ status: 'EN_ALMACEN', remissions: [buildRemission()] }),
      );
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', { name: /Registrar abono/ }),
      );
      const dialog = screen.getByRole('dialog', { name: 'Registrar abono' });
      expect(within(dialog).getByText('Saldo')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the void-payment modal from the payment row', async () => {
      renderOrder(
        buildOrder({
          status: 'EN_ALMACEN',
          remissions: [
            buildRemission({
              amountPaid: '25',
              paymentStatus: 'ABONADO',
              payments: [buildPayment()],
            }),
          ],
        }),
      );
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', { name: /Anular abono de/ }),
      );
      const dialog = screen.getByRole('dialog', { name: 'Anular abono' });
      await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('blocks voiding a remission that still has valid payments', async () => {
      renderOrder(
        buildOrder({
          status: 'EN_ALMACEN',
          remissions: [
            buildRemission({
              amountPaid: '25',
              paymentStatus: 'ABONADO',
              payments: [buildPayment()],
            }),
          ],
        }),
      );

      expect(
        await screen.findByRole('button', { name: /^Anular$/ }),
      ).toBeDisabled();
    });

    it('opens and closes the void-remission modal', async () => {
      renderOrder(
        buildOrder({ status: 'EN_ALMACEN', remissions: [buildRemission()] }),
      );
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /^Anular$/ }));
      const dialog = screen.getByRole('dialog', {
        name: 'Anular remisión HT 7',
      });
      await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens and closes the tracking editor', async () => {
      renderOrder(warehousedOrder);
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole('button', { name: /Editar seguimiento/ }),
      );
      const dialog = screen.getByRole('dialog', { name: 'Editar seguimiento' });
      expect(
        within(dialog).getByLabelText('Fecha de envío estimada'),
      ).toHaveValue('2026-01-25');

      await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('hides "Cancelar pedido" once the order has an active remission', async () => {
      renderOrder(
        buildOrder({ status: 'EN_ALMACEN', remissions: [buildRemission()] }),
      );

      await screen.findByText('HT 7');
      expect(
        screen.queryByRole('button', { name: /Cancelar pedido/ }),
      ).not.toBeInTheDocument();
    });
  });
});
