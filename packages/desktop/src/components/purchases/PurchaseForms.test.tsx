import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ReceivePurchaseForm } from './ReceivePurchaseForm';
import {
  AddSupplierPaymentForm,
  VoidSupplierPaymentForm,
} from './SupplierPaymentForms';
import { EditPurchaseForm } from './EditPurchaseForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import {
  buildPurchaseItem,
  buildPurchaseOrder,
  buildSupplierPayment,
} from '../../test/factories';

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

function lastCall(): [string, RequestInit] {
  return mockedApiFetch.mock.calls[mockedApiFetch.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
}

function bodyOf(call: [string, RequestInit]): Record<string, unknown> {
  return JSON.parse(call[1].body as string) as Record<string, unknown>;
}

const partialOrder = buildPurchaseOrder({
  status: 'PARCIAL',
  items: [
    buildPurchaseItem({ quantityReceived: '6' }),
    buildPurchaseItem({
      id: 'po-item-2',
      productId: 'product-2',
      quantity: '100',
      unitCost: '45',
      quantityReceived: '100',
      product: {
        id: 'product-2',
        sku: 'MP-TOR',
        name: 'Tornillo 4x16',
        unit: { abbreviation: 'und' },
      },
    }),
    buildPurchaseItem({
      id: 'po-item-3',
      productId: 'product-3',
      quantity: '20',
      unitCost: '10',
      product: {
        id: 'product-3',
        sku: 'EMP',
        name: 'Caja corrugada',
        unit: { abbreviation: 'cja' },
      },
    }),
  ],
});

describe('ReceivePurchaseForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(partialOrder);
  });

  it('starts each pending line with what is missing and skips lines set to 0', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <ReceivePurchaseForm order={partialOrder} onSuccess={onSuccess} />,
    );

    // La línea ya completa (tornillos) no aparece.
    expect(screen.queryByText('Tornillo 4x16')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Cantidad recibida de Lámina de acero'),
    ).toHaveValue(4);
    await user.clear(
      screen.getByLabelText('Cantidad recibida de Caja corrugada'),
    );
    await user.type(
      screen.getByLabelText('Cantidad recibida de Caja corrugada'),
      '0',
    );
    await user.click(screen.getByRole('button', { name: /Recibir y sumar/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [path] = lastCall();
    expect(path).toBe('/purchase-orders/po-1/receive');
    expect(bodyOf(lastCall()).items).toEqual([
      { itemId: 'po-item-1', quantity: 4 },
    ]);
  });

  it('rejects receiving more than what is missing, or nothing at all', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <ReceivePurchaseForm order={partialOrder} onSuccess={vi.fn()} />,
    );

    const steel = screen.getByLabelText('Cantidad recibida de Lámina de acero');
    await user.clear(steel);
    await user.type(steel, '9');
    await user.click(screen.getByRole('button', { name: /Recibir y sumar/ }));
    expect(
      await screen.findByText(/De Lámina de acero puedes recibir entre 0 y 4/),
    ).toBeInTheDocument();

    await user.clear(steel);
    await user.clear(
      screen.getByLabelText('Cantidad recibida de Caja corrugada'),
    );
    await user.click(screen.getByRole('button', { name: /Recibir y sumar/ }));
    expect(
      await screen.findByText('Indica cuánto llegó de al menos un producto.'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('shows the backend error', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(400, 'De Lámina de acero solo faltan 2 por recibir'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <ReceivePurchaseForm order={partialOrder} onSuccess={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /Recibir y sumar/ }));

    expect(
      await screen.findByText('De Lámina de acero solo faltan 2 por recibir'),
    ).toBeInTheDocument();
  });
});

describe('AddSupplierPaymentForm', () => {
  const order = buildPurchaseOrder({
    status: 'PARCIAL',
    total: '5000',
    amountPaid: '1000',
    receivedValue: '3000',
    payable: '2000',
  });

  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(order);
  });

  it('proposes paying what is owed and registers the payment', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <AddSupplierPaymentForm order={order} onSuccess={onSuccess} />,
    );

    await user.click(screen.getByRole('button', { name: /Todo · \$\s2\.000/ }));
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(lastCall()[0]).toBe('/purchase-orders/po-1/payments');
    expect(bodyOf(lastCall())).toEqual(
      expect.objectContaining({ amount: 2000, method: 'TRANSFERENCIA' }),
    );
  });

  it('allows paying ahead up to the purchase total, not more', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AddSupplierPaymentForm order={order} onSuccess={vi.fn()} />,
    );

    await user.type(screen.getByLabelText('Monto'), '4500');
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));

    expect(
      await screen.findByText(/El pago no puede superar \$ 4\.000/),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('proposes the remaining balance when nothing is owed yet', () => {
    renderWithClient(
      <AddSupplierPaymentForm
        order={{ ...order, payable: '0' }}
        onSuccess={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Todo · \$\s4\.000/ }),
    ).toBeInTheDocument();
  });
});

describe('VoidSupplierPaymentForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(buildPurchaseOrder());
  });

  it('requires a reason and voids the payment', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <VoidSupplierPaymentForm
        orderId="po-1"
        payment={buildSupplierPayment()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Anular pago' }));
    expect(
      await screen.findByText(/Ingresa el motivo de la anulación/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Motivo'), ' Registrado dos veces ');
    await user.click(screen.getByRole('button', { name: 'Anular pago' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(lastCall()[0]).toBe(
      '/purchase-orders/po-1/payments/supplier-payment-1/void',
    );
    expect(bodyOf(lastCall())).toEqual({ reason: 'Registrado dos veces' });
  });
});

describe('EditPurchaseForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(buildPurchaseOrder());
  });

  it('saves the tracking data and clears what was emptied', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <EditPurchaseForm
        order={buildPurchaseOrder({
          expectedDate: '2026-11-04T00:00:00.000Z',
          supplierInvoice: 'FV-1',
          notes: 'Llamar antes',
        })}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByLabelText('Fecha esperada')).toHaveValue('2026-11-04');
    await user.clear(screen.getByLabelText('Factura del proveedor'));
    await user.clear(screen.getByLabelText('Notas'));
    await user.type(screen.getByLabelText('Notas'), 'Entregar en portería');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(lastCall()[0]).toBe('/purchase-orders/po-1');
    expect(bodyOf(lastCall())).toEqual({
      expectedDate: '2026-11-04',
      supplierInvoice: null,
      notes: 'Entregar en portería',
    });
  });

  it('starts empty for a purchase without tracking data', () => {
    renderWithClient(
      <EditPurchaseForm order={buildPurchaseOrder()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByLabelText('Fecha esperada')).toHaveValue('');
    expect(screen.getByLabelText('Factura del proveedor')).toHaveValue('');
  });
});
