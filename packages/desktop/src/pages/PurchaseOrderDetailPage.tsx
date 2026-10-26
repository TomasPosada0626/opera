import { useState } from 'react';
import {
  Ban,
  CalendarClock,
  CheckCheck,
  FileText,
  HandCoins,
  History,
  PackageCheck,
  Pencil,
  Warehouse,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { FormError } from '../components/form/Field';
import {
  PurchaseStatusBadge,
  SupplierPaymentBadge,
} from '../components/purchases/PurchaseBadges';
import { EditPurchaseForm } from '../components/purchases/EditPurchaseForm';
import { ReceivePurchaseForm } from '../components/purchases/ReceivePurchaseForm';
import {
  AddSupplierPaymentForm,
  VoidSupplierPaymentForm,
} from '../components/purchases/SupplierPaymentForms';
import { usePurchaseOrder } from '../hooks/usePurchaseOrders';
import {
  useCancelPurchaseOrder,
  useClosePurchaseOrder,
} from '../hooks/usePurchaseOrderMutations';
import { getCurrentUser } from '../lib/current-user';
import { useHasSeveralWarehouses } from '../hooks/useWarehouses';
import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  formatQuantity,
} from '../lib/format';
import { PAYMENT_METHOD_LABEL } from '../lib/order-status';
import { isPurchaseOpen } from '../lib/purchase-status';
import type { PurchaseOrder, SupplierPayment } from '../types/purchase-order';

function PaymentCard({
  order,
  isAdmin,
  onAddPayment,
}: {
  order: PurchaseOrder;
  isAdmin: boolean;
  onAddPayment: () => void;
}) {
  const total = Number(order.total);
  const paid = Number(order.amountPaid);
  const payable = Number(order.payable);
  const remaining = total - paid;
  const paidRatio = total > 0 ? Math.min(1, paid / total) : 0;

  return (
    <Card className="p-5">
      <CardHeader
        title="Pago al proveedor"
        description="Se debe lo que ya llegó; lo pendiente de recibir todavía no."
      />
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-ink-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
            Por pagar
          </p>
          <p
            className={`figures mt-1 text-[28px] leading-none font-semibold ${
              payable > 0 ? 'text-danger' : 'text-ink'
            }`}
          >
            {formatMoney(payable)}
          </p>
          {payable === 0 && paid > Number(order.receivedValue) && (
            <p className="text-ink-muted mt-1.5 text-xs">
              Hay un anticipo de{' '}
              <span className="figures">
                {formatMoney(paid - Number(order.receivedValue))}
              </span>{' '}
              sobre lo recibido.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="bg-chrome-strong h-2 overflow-hidden rounded-full">
            <div
              className="bg-success h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.round(paidRatio * 100)}%` }}
            />
          </div>
          <p className="text-ink-faint text-xs">
            {Math.round(paidRatio * 100)}% pagado del total de la compra
          </p>
        </div>
        <dl className="border-line flex flex-col gap-2 border-t pt-4 text-[13px]">
          {[
            ['Valor de la compra', order.total],
            ['Recibido', order.receivedValue],
            ['Pagado', order.amountPaid],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="figures text-ink font-medium">
                {formatMoney(value)}
              </dd>
            </div>
          ))}
        </dl>
        {isAdmin && order.status !== 'CANCELADA' && remaining > 0 && (
          <Button onClick={onAddPayment}>
            <HandCoins />
            Registrar pago
          </Button>
        )}
      </div>
    </Card>
  );
}

function PaymentsList({
  order,
  isAdmin,
  onVoid,
}: {
  order: PurchaseOrder;
  isAdmin: boolean;
  onVoid: (payment: SupplierPayment) => void;
}) {
  if (order.payments.length === 0) {
    return null;
  }
  return (
    <Card className="p-5">
      <CardHeader title="Pagos" description="Del más viejo al más reciente." />
      <ul className="flex flex-col gap-3">
        {order.payments.map((payment) => (
          <li
            key={payment.id}
            className={`group flex items-start justify-between gap-3 text-[13px] ${
              payment.voidedAt ? 'text-ink-faint' : 'text-ink'
            }`}
          >
            <div className="min-w-0">
              <p className="font-medium">
                {PAYMENT_METHOD_LABEL[payment.method]}
                <span className="text-ink-faint font-normal">
                  {' '}
                  · {formatDate(payment.paidAt)}
                </span>
              </p>
              {payment.note && (
                <p className="text-ink-muted truncate text-xs">
                  {payment.note}
                </p>
              )}
              {payment.voidedAt && (
                <p className="text-danger text-xs">
                  Anulado: {payment.voidReason}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`figures font-semibold ${
                  payment.voidedAt ? 'line-through' : 'text-success'
                }`}
              >
                {formatMoney(payment.amount)}
              </span>
              {isAdmin && !payment.voidedAt && (
                <button
                  type="button"
                  onClick={() => onVoid(payment)}
                  aria-label={`Anular pago de ${formatMoney(payment.amount)}`}
                  className="text-ink-faint hover:text-danger hover:bg-danger-surface focus-visible:ring-accent rounded-md p-1 opacity-0 transition-all duration-200 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
                >
                  <Ban className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReceiptsCard({ order }: { order: PurchaseOrder }) {
  const receipts = order.items
    .flatMap((item) =>
      item.receipts.map((receipt) => ({ ...receipt, product: item.product })),
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <Card className="p-5">
      <CardHeader
        title="Recepciones"
        description="Cada llegada de mercancía, ya sumada al inventario."
      />
      {receipts.length === 0 ? (
        <p className="text-ink-muted text-[13px]">
          Todavía no ha llegado nada de esta compra.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {receipts.map((receipt) => (
            <li
              key={receipt.id}
              className="flex items-start justify-between gap-3 text-[13px]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="bg-success-surface text-success border-success-line mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
                  <PackageCheck className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-ink truncate font-medium">
                    {receipt.product.name}
                  </p>
                  <p className="text-ink-faint text-xs">
                    {formatDateTime(receipt.receivedAt)} · {receipt.user.name}
                  </p>
                </div>
              </div>
              <span className="figures text-ink shrink-0 font-semibold">
                +{formatQuantity(receipt.quantity)}{' '}
                {receipt.product.unit.abbreviation}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Dialog =
  | { kind: 'receive' }
  | { kind: 'edit' }
  | { kind: 'pay' }
  | { kind: 'void'; payment: SupplierPayment }
  | { kind: 'close' }
  | { kind: 'cancel' };

function PurchaseOrderDetailPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;
  const orderQuery = usePurchaseOrder(purchaseOrderId ?? '');
  const order = orderQuery.data;
  const closePurchase = useClosePurchaseOrder();
  const cancelPurchase = useCancelPurchaseOrder();
  const showWarehouses = useHasSeveralWarehouses();

  if (orderQuery.isLoading || !order) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ to: '/compras', label: 'Volver a compras' }}
          eyebrow="Compra"
          title="Compra"
        />
        <p className="text-ink-muted text-sm">
          {orderQuery.isError ? 'No se encontró la compra.' : 'Cargando…'}
        </p>
      </div>
    );
  }

  const open = isPurchaseOpen(order.status);
  const hasValidPayments = order.payments.some((p) => !p.voidedAt);
  const closeDialog = () => setDialog(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: '/compras', label: 'Volver a compras' }}
        eyebrow={`Compra No. ${order.number}`}
        title={
          <Link
            to={`/proveedores/${order.supplier.id}`}
            className="hover:text-accent transition-colors"
          >
            {order.supplier.name}
          </Link>
        }
        meta={
          <>
            <PurchaseStatusBadge status={order.status} />
            <SupplierPaymentBadge status={order.paymentStatus} />
            {showWarehouses && (
              <span className="inline-flex items-center gap-1.5">
                <Warehouse className="h-3.5 w-3.5" />
                {order.warehouse.name}
              </span>
            )}
            <span>Comprada el {formatDate(order.purchasedAt)}</span>
          </>
        }
        actions={
          isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {order.status === 'PENDIENTE' && (
                <Button
                  variant="ghost"
                  onClick={() => setDialog({ kind: 'cancel' })}
                  disabled={hasValidPayments}
                  title={
                    hasValidPayments
                      ? 'Anula primero sus pagos para poder cancelarla.'
                      : undefined
                  }
                >
                  <Ban />
                  Cancelar compra
                </Button>
              )}
              {order.status === 'PARCIAL' && (
                <Button
                  variant="secondary"
                  onClick={() => setDialog({ kind: 'close' })}
                >
                  <CheckCheck />
                  Cerrar con lo recibido
                </Button>
              )}
              {order.status !== 'CANCELADA' && (
                <Button
                  variant="secondary"
                  onClick={() => setDialog({ kind: 'edit' })}
                >
                  <Pencil />
                  Editar datos
                </Button>
              )}
              {open && (
                <Button onClick={() => setDialog({ kind: 'receive' })}>
                  <PackageCheck />
                  Recibir mercancía
                </Button>
              )}
            </div>
          )
        }
      />

      {!order.tracksPayment && (
        <div className="border-line bg-chrome/60 text-ink-secondary flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]">
          <History className="text-ink-muted mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Compra histórica: se registró antes de que Opera llevara los pagos a
            proveedores, así que no cuenta en las cuentas por pagar.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <div className="px-5 pt-5">
              <CardHeader title="Productos" />
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-line bg-chrome-strong text-ink-muted border-y text-[11px] font-semibold tracking-[0.08em] uppercase">
                  <th className="px-5 py-2.5">Producto</th>
                  <th className="px-5 py-2.5 text-right">Recibido</th>
                  <th className="px-5 py-2.5 text-right">Costo</th>
                  <th className="px-5 py-2.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const ratio =
                    Number(item.quantity) > 0
                      ? Math.min(
                          1,
                          Number(item.quantityReceived) / Number(item.quantity),
                        )
                      : 0;
                  return (
                    <tr
                      key={item.id}
                      className="border-line border-b last:border-b-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink font-medium">
                          {item.product.name}
                        </p>
                        <p className="code text-ink-faint text-xs">
                          {item.product.sku}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="ml-auto flex w-32 flex-col items-end gap-1">
                          <span className="figures text-ink whitespace-nowrap">
                            {formatQuantity(item.quantityReceived)}
                            <span className="text-ink-faint">
                              {' '}
                              / {formatQuantity(item.quantity)}{' '}
                              {item.product.unit.abbreviation}
                            </span>
                          </span>
                          <div className="bg-chrome-strong h-1 w-full overflow-hidden rounded-full">
                            <div
                              className={`h-full rounded-full ${
                                ratio >= 1 ? 'bg-success' : 'bg-accent'
                              }`}
                              style={{ width: `${Math.round(ratio * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="figures text-ink-secondary px-5 py-3 text-right whitespace-nowrap">
                        {formatMoney(item.unitCost)}
                      </td>
                      <td className="figures text-ink px-5 py-3 text-right font-medium whitespace-nowrap">
                        {formatMoney(
                          Number(item.quantity) * Number(item.unitCost),
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-line bg-chrome/50 border-t">
                  <td
                    colSpan={3}
                    className="text-ink-muted px-5 py-3 text-right text-[13px]"
                  >
                    {order.status === 'CERRADA'
                      ? 'Total (cerrada con lo recibido)'
                      : 'Total de la compra'}
                  </td>
                  <td className="figures text-ink px-5 py-3 text-right text-base font-semibold whitespace-nowrap">
                    {formatMoney(order.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <ReceiptsCard order={order} />
        </div>

        <div className="flex flex-col gap-6">
          {order.tracksPayment && (
            <PaymentCard
              order={order}
              isAdmin={isAdmin}
              onAddPayment={() => setDialog({ kind: 'pay' })}
            />
          )}
          <PaymentsList
            order={order}
            isAdmin={isAdmin}
            onVoid={(payment) => setDialog({ kind: 'void', payment })}
          />
          <Card className="p-5">
            <CardHeader title="Datos de la compra" />
            <dl className="flex flex-col gap-3 text-[13px]">
              <div className="flex items-start gap-2.5">
                <CalendarClock className="text-ink-faint mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-ink-muted text-xs">Fecha esperada</dt>
                  <dd className="text-ink">
                    {order.expectedDate
                      ? formatDateOnly(order.expectedDate)
                      : 'Sin fecha'}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <FileText className="text-ink-faint mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <dt className="text-ink-muted text-xs">
                    Factura del proveedor
                  </dt>
                  <dd className="text-ink">
                    {order.supplierInvoice ?? 'Sin registrar'}
                  </dd>
                </div>
              </div>
              {order.notes && (
                <p className="text-ink-secondary border-line border-t pt-3 leading-5 whitespace-pre-line">
                  {order.notes}
                </p>
              )}
              <p className="text-ink-faint border-line border-t pt-3 text-xs">
                Registrada por {order.user.name}
                {order.cancelledAt &&
                  ` · Cancelada el ${formatDate(order.cancelledAt)}`}
                {order.closedAt &&
                  ` · Cerrada el ${formatDate(order.closedAt)}`}
              </p>
            </dl>
          </Card>
        </div>
      </div>

      {dialog?.kind === 'receive' && (
        <Modal
          title="Recibir mercancía"
          description={`Compra No. ${order.number} — ${order.supplier.name}`}
          size="lg"
          onClose={closeDialog}
        >
          <ReceivePurchaseForm order={order} onSuccess={closeDialog} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title="Editar datos de la compra" onClose={closeDialog}>
          <EditPurchaseForm order={order} onSuccess={closeDialog} />
        </Modal>
      )}
      {dialog?.kind === 'pay' && (
        <Modal
          title="Registrar pago"
          description={order.supplier.name}
          onClose={closeDialog}
        >
          <AddSupplierPaymentForm order={order} onSuccess={closeDialog} />
        </Modal>
      )}
      {dialog?.kind === 'void' && (
        <Modal title="Anular pago" onClose={closeDialog}>
          <VoidSupplierPaymentForm
            orderId={order.id}
            payment={dialog.payment}
            onSuccess={closeDialog}
          />
        </Modal>
      )}
      {dialog?.kind === 'close' && (
        <Modal title="Cerrar con lo recibido" onClose={closeDialog}>
          <div className="flex flex-col gap-4">
            <p className="text-ink-secondary text-sm leading-6">
              El proveedor no va a mandar el resto: la compra queda terminada y
              su total pasa a ser lo que llegó (
              <span className="figures font-medium">
                {formatMoney(order.receivedValue)}
              </span>
              ). Lo que faltaba ya no se podrá recibir.
            </p>
            <FormError
              error={closePurchase.error}
              fallback="No se pudo cerrar la compra."
            />
            <Button
              disabled={closePurchase.isPending}
              onClick={() =>
                closePurchase.mutate(order.id, { onSuccess: closeDialog })
              }
            >
              <CheckCheck />
              {closePurchase.isPending ? 'Cerrando…' : 'Cerrar compra'}
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'cancel' && (
        <Modal title="Cancelar compra" onClose={closeDialog}>
          <div className="flex flex-col gap-4">
            <p className="text-ink-secondary text-sm leading-6">
              La compra No. {order.number} queda cancelada. No llegó nada, así
              que el inventario no cambia.
            </p>
            <FormError
              error={cancelPurchase.error}
              fallback="No se pudo cancelar la compra."
            />
            <Button
              variant="danger"
              disabled={cancelPurchase.isPending}
              onClick={() =>
                cancelPurchase.mutate(order.id, { onSuccess: closeDialog })
              }
            >
              <Ban />
              {cancelPurchase.isPending ? 'Cancelando…' : 'Cancelar compra'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PurchaseOrderDetailPage;
