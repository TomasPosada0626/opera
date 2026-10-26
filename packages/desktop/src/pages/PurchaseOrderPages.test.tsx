import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
import PurchaseOrdersPage from './PurchaseOrdersPage';
import PurchaseOrderDetailPage from './PurchaseOrderDetailPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import {
  buildPurchaseItem,
  buildPurchaseOrder,
  buildSupplierPayment,
  fakeJwt,
  paginated,
} from '../test/factories';
import type { PurchaseOrder } from '../types/purchase-order';

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = apiFetch as unknown as Mock;

function renderAt(path: string, ui: ReactElement, route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={ui} />
          <Route path="/compras/:purchaseOrderId" element={<p>detalle</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const payables = [
  {
    supplierId: 'supplier-1',
    supplierName: 'Aceros de Colombia S.A.',
    purchaseOrderCount: 2,
    totalReceived: '7500',
    totalPaid: '5000',
    balance: '2500',
    oldestPendingAt: '2026-10-10T12:00:00.000Z',
    daysPending: 15,
  },
];

describe('PurchaseOrdersPage', () => {
  let purchases: PurchaseOrder[];

  beforeEach(() => {
    mockedApiFetch.mockReset();
    purchases = [
      buildPurchaseOrder({
        status: 'PARCIAL',
        supplierInvoice: 'FV-88',
        receivedValue: '2500',
        payable: '1500',
        paymentStatus: 'ABONADA',
      }),
      buildPurchaseOrder({
        id: 'po-2',
        number: 8,
        status: 'RECIBIDA',
        receivedValue: '5000',
        paymentStatus: 'PAGADA',
        items: [buildPurchaseItem(), buildPurchaseItem({ id: 'po-item-2' })],
      }),
    ];
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/reports/por-pagar')) {
        return Promise.resolve(payables);
      }
      if (path.startsWith('/purchase-orders')) {
        return Promise.resolve(paginated(purchases));
      }
      return Promise.resolve(paginated([]));
    });
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('lists purchases with what arrived and what is owed', async () => {
    renderAt('/compras', <PurchaseOrdersPage />, '/compras');

    expect(await screen.findByText('#7')).toBeInTheDocument();
    expect(screen.getByText(/Factura FV-88/)).toBeInTheDocument();
    expect(screen.getByText('2 productos')).toBeInTheDocument();
    expect(screen.getByText('Llegó una parte')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/Debe\s\$\s1\.500/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver detalle de la compra 7' }),
    ).toHaveAttribute('href', '/compras/po-1');
    // KPI de lo que se debe a proveedores.
    expect(await screen.findByText('Por pagar')).toBeInTheDocument();
  });

  it('filters by open purchases, status and number', async () => {
    const user = userEvent.setup();
    renderAt('/compras', <PurchaseOrdersPage />, '/compras');
    await screen.findByText('#7');

    const filters = screen.getByRole('group', { name: 'Filtrar compras' });
    await user.click(
      within(filters).getByRole('button', { name: /Por recibir/ }),
    );
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\/purchase-orders\?page=1&pageSize=20&open=true$/,
        ),
      ),
    );

    await user.click(
      within(filters).getByRole('button', { name: 'Recibidas' }),
    );
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=RECIBIDA'),
      ),
    );

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar compra por número' }),
      '8',
    );
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=8'),
      ),
    );
  });

  it('opens the new purchase form only for an ADMIN', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    const { unmount } = renderAt(
      '/compras',
      <PurchaseOrdersPage />,
      '/compras',
    );
    await screen.findByText('#7');
    expect(
      screen.queryByRole('button', { name: 'Nueva compra' }),
    ).not.toBeInTheDocument();
    unmount();

    setAuthToken(fakeJwt(['ADMIN']));
    const user = userEvent.setup();
    renderAt('/compras', <PurchaseOrdersPage />, '/compras');
    await user.click(
      await screen.findByRole('button', { name: 'Nueva compra' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nueva compra' }),
    ).toBeInTheDocument();
  });
});

describe('PurchaseOrderDetailPage', () => {
  function mockDetail(order: PurchaseOrder) {
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method) {
        return Promise.resolve(order);
      }
      if (path === `/purchase-orders/${order.id}`) {
        return Promise.resolve(order);
      }
      return Promise.resolve(paginated([]));
    });
  }

  function renderDetail() {
    return renderAt(
      '/compras/po-1',
      <PurchaseOrderDetailPage />,
      '/compras/:purchaseOrderId',
    );
  }

  beforeEach(() => {
    mockedApiFetch.mockReset();
    setAuthToken(fakeJwt(['ADMIN']));
  });

  afterEach(() => {
    clearAuthToken();
  });

  const partial = buildPurchaseOrder({
    status: 'PARCIAL',
    total: '9500',
    amountPaid: '5000',
    receivedValue: '7500',
    payable: '2500',
    paymentStatus: 'ABONADA',
    supplierInvoice: 'FV-2231',
    expectedDate: '2026-11-04T00:00:00.000Z',
    notes: 'Entregar en portería 2',
    items: [
      buildPurchaseItem({
        quantityReceived: '6',
        receipts: [
          {
            id: 'receipt-1',
            quantity: '6',
            receivedAt: '2026-10-20T15:00:00.000Z',
            stockMovementId: 'movement-1',
            user: { id: 'user-1', name: 'Admin' },
          },
        ],
      }),
    ],
    payments: [
      buildSupplierPayment({ amount: '5000', note: 'Anticipo' }),
      buildSupplierPayment({
        id: 'supplier-payment-2',
        amount: '300',
        voidedAt: '2026-10-21T12:00:00.000Z',
        voidReason: 'Duplicado',
      }),
    ],
  });

  it('shows lines, receipts, payments and what is owed', async () => {
    mockDetail(partial);
    renderDetail();

    expect(await screen.findByText('Compra No. 7')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Aceros de Colombia S.A.' }),
    ).toHaveAttribute('href', '/proveedores/supplier-1');
    expect(screen.getByText('FV-2231')).toBeInTheDocument();
    expect(screen.getByText('Entregar en portería 2')).toBeInTheDocument();
    expect(screen.getByText('+6 kg')).toBeInTheDocument();
    expect(screen.getByText('Anticipo')).toBeInTheDocument();
    expect(screen.getByText('Anulado: Duplicado')).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s2\.500/).length).toBeGreaterThan(0);
    // Parcial: se puede recibir lo que falta o cerrar con lo recibido, no
    // cancelar.
    expect(
      screen.getByRole('button', { name: /Recibir mercancía/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Cerrar con lo recibido/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Cancelar compra/ }),
    ).not.toBeInTheDocument();
  });

  it('closes a partial purchase after confirming', async () => {
    mockDetail(partial);
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole('button', { name: /Cerrar con lo recibido/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Cerrar compra' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/purchase-orders/po-1/close',
        {
          method: 'PATCH',
        },
      ),
    );
  });

  it('cancels a pending purchase without payments', async () => {
    mockDetail(buildPurchaseOrder());
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole('button', { name: /Cancelar compra/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancelar compra',
    });
    await user.click(
      within(dialog).getByRole('button', { name: /Cancelar compra/ }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/purchase-orders/po-1/cancel',
        {
          method: 'PATCH',
        },
      ),
    );
    expect(
      screen.getByText('Todavía no ha llegado nada de esta compra.'),
    ).toBeInTheDocument();
  });

  it('does not let a pending purchase with payments be cancelled', async () => {
    mockDetail(buildPurchaseOrder({ payments: [buildSupplierPayment()] }));
    renderDetail();

    expect(
      await screen.findByRole('button', { name: /Cancelar compra/ }),
    ).toBeDisabled();
  });

  it('opens the receive, edit, payment and void dialogs', async () => {
    mockDetail(partial);
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole('button', { name: /Recibir mercancía/ }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Recibir mercancía' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    await user.click(screen.getByRole('button', { name: /Editar datos/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Editar datos de la compra' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(
      await screen.findByRole('dialog', { name: 'Registrar pago' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    await user.click(
      screen.getByRole('button', { name: /Anular pago de \$\s5\.000/ }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Anular pago' }),
    ).toBeInTheDocument();
  });

  it('marks a migrated purchase as historic, without the payment panel', async () => {
    mockDetail(
      buildPurchaseOrder({
        status: 'RECIBIDA',
        tracksPayment: false,
        paymentStatus: 'NO_APLICA',
      }),
    );
    renderDetail();

    expect(await screen.findByText(/Compra histórica/)).toBeInTheDocument();
    expect(screen.queryByText('Pago al proveedor')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Recibir mercancía/ }),
    ).not.toBeInTheDocument();
  });

  it('says when the purchase does not exist', async () => {
    mockedApiFetch.mockRejectedValue(new Error('404'));
    renderDetail();

    expect(
      await screen.findByText('No se encontró la compra.'),
    ).toBeInTheDocument();
  });
});
