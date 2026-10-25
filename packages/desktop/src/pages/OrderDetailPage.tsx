import { useState } from 'react';
import {
  Ban,
  CalendarClock,
  Download,
  HandCoins,
  Pencil,
  Plus,
  Printer,
  StickyNote,
  Warehouse,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { EditOrderTrackingForm } from '../components/orders/EditOrderTrackingForm';
import {
  DeliveryDate,
  OrderStatusBadge,
  PaymentStatusBadge,
} from '../components/orders/OrderBadges';
import { OrderStatusActions } from '../components/orders/OrderStatusActions';
import { OrderTimeline } from '../components/orders/OrderTimeline';
import {
  AddPaymentForm,
  VoidPaymentForm,
} from '../components/orders/PaymentForms';
import { RemissionForm } from '../components/orders/RemissionForm';
import { VoidRemissionForm } from '../components/orders/VoidRemissionForm';
import { useOrder } from '../hooks/useOrder';
import { downloadFile } from '../lib/download-file';
import { getCurrentUser } from '../lib/current-user';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
} from '../lib/format';
import {
  deliveredFor,
  orderCollection,
  orderTotal,
  PAYMENT_METHOD_LABEL,
} from '../lib/order-status';
import type { Order, Remission, RemissionPayment } from '../types/order';

async function downloadRemissionPdf(remissionId: string, number: number) {
  await downloadFile(
    `/remissions/${remissionId}/pdf`,
    `remision-${number}.pdf`,
  );
}

function CollectionCard({ order }: { order: Order }) {
  const { dispatched, paid, pending } = orderCollection(order);
  const total = orderTotal(order);
  const paidRatio = dispatched > 0 ? Math.min(1, paid / dispatched) : 0;

  return (
    <Card className="p-5">
      <CardHeader
        title="Cobro"
        description="Sobre lo despachado (remisiones vigentes)."
      />
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-ink-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
            Saldo pendiente
          </p>
          <p
            className={`figures mt-1 text-[28px] leading-none font-semibold ${
              pending > 0 ? 'text-danger' : 'text-success'
            }`}
          >
            {formatMoney(pending)}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="bg-chrome-strong h-2 overflow-hidden rounded-full">
            <div
              className="bg-success h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.round(paidRatio * 100)}%` }}
            />
          </div>
          <p className="text-ink-faint text-xs">
            {Math.round(paidRatio * 100)}% cobrado de lo despachado
          </p>
        </div>
        <dl className="border-line flex flex-col gap-2 border-t pt-4 text-[13px]">
          {[
            ['Valor del pedido', total],
            ['Despachado', dispatched],
            ['Abonado', paid],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="figures text-ink font-medium">
                {formatMoney(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

interface RemissionCardProps {
  order: Order;
  remission: Remission;
  isAdmin: boolean;
  onAddPayment: (remission: Remission) => void;
  onVoidPayment: (remission: Remission, payment: RemissionPayment) => void;
  onVoid: (remission: Remission) => void;
}

function RemissionCard({
  order,
  remission,
  isAdmin,
  onAddPayment,
  onVoidPayment,
  onVoid,
}: RemissionCardProps) {
  const isVoided = !!remission.voidedAt;
  const pending = Number(remission.total) - Number(remission.amountPaid);
  const hasValidPayments = remission.payments.some((p) => !p.voidedAt);

  return (
    <li
      className={`border-line bg-surface-raised rounded-xl border shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md ${
        isVoided ? 'opacity-70' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-ink text-sm font-semibold">
              Remisión No. <span className="figures">{remission.number}</span>
            </p>
            {isVoided ? (
              <Badge variant="danger">Anulada</Badge>
            ) : (
              <PaymentStatusBadge status={remission.paymentStatus} />
            )}
          </div>
          <p className="text-ink-muted mt-0.5 text-xs">
            {formatDateTime(remission.createdAt)} · {remission.user.name}
          </p>
          {isVoided && (
            <p className="text-ink-muted mt-1 text-xs italic">
              Motivo: {remission.voidReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {isAdmin && !isVoided && pending > 0 && (
            <Button size="sm" onClick={() => onAddPayment(remission)}>
              <HandCoins />
              Registrar abono
            </Button>
          )}
          <Link
            to={`/imprimir-remision?id=${remission.id}`}
            className="text-ink-muted hover:text-ink hover:bg-chrome-strong focus-visible:ring-accent inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-all duration-200 outline-none focus-visible:ring-2"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void downloadRemissionPdf(remission.id, remission.number)
            }
          >
            <Download />
            Descargar PDF
          </Button>
          {isAdmin && !isVoided && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onVoid(remission)}
              disabled={hasValidPayments}
              title={
                hasValidPayments
                  ? 'Anula primero sus abonos (y regístralos en la remisión corregida).'
                  : undefined
              }
            >
              <Ban />
              Anular
            </Button>
          )}
        </div>
      </div>

      <div className="text-ink-muted px-5 pt-2 text-xs">
        {remission.items
          .map((item) => {
            const line = order.items.find((o) => o.id === item.orderItemId);
            return `${formatQuantity(item.quantity)} × ${line?.product.name ?? '—'}`;
          })
          .join(' · ')}
      </div>

      <div className="border-line mt-4 grid grid-cols-3 border-t">
        {[
          ['Total', remission.total, 'text-ink'],
          ['Abonado', remission.amountPaid, 'text-success'],
          ['Saldo', String(pending), pending > 0 ? 'text-danger' : 'text-ink'],
        ].map(([label, value, tone]) => (
          <div
            key={label}
            className="border-line flex flex-col gap-0.5 border-r px-5 py-3 last:border-r-0"
          >
            <span className="text-ink-faint text-[11px] font-semibold tracking-[0.08em] uppercase">
              {label}
            </span>
            <span className={`figures text-sm font-semibold ${tone}`}>
              {formatMoney(value)}
            </span>
          </div>
        ))}
      </div>

      {remission.payments.length > 0 && (
        <div className="border-line border-t px-5 py-3">
          <p className="text-ink-faint mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
            Abonos
          </p>
          <ul className="flex flex-col gap-1.5">
            {remission.payments.map((payment) => (
              <li
                key={payment.id}
                className={`group flex items-center justify-between gap-3 text-[13px] ${
                  payment.voidedAt ? 'text-ink-faint' : 'text-ink'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-ink-muted w-24 shrink-0 text-xs">
                    {formatDate(payment.paidAt)}
                  </span>
                  <span className="shrink-0">
                    {PAYMENT_METHOD_LABEL[payment.method]}
                  </span>
                  {payment.note && (
                    <span className="text-ink-faint truncate text-xs">
                      {payment.note}
                    </span>
                  )}
                  {payment.voidedAt && (
                    <span className="text-danger shrink-0 text-xs">
                      Anulado: {payment.voidReason}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`figures font-medium ${payment.voidedAt ? 'line-through' : ''}`}
                  >
                    {formatMoney(payment.amount)}
                  </span>
                  {isAdmin && !payment.voidedAt && (
                    <button
                      type="button"
                      onClick={() => onVoidPayment(remission, payment)}
                      aria-label={`Anular abono de ${formatMoney(payment.amount)}`}
                      className="text-ink-faint hover:text-danger hover:bg-danger-surface focus-visible:ring-accent rounded-md p-1 opacity-0 transition-all duration-200 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [isRemissionModalOpen, setIsRemissionModalOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [payingRemission, setPayingRemission] = useState<Remission | null>(
    null,
  );
  const [voidingPayment, setVoidingPayment] = useState<{
    remission: Remission;
    payment: RemissionPayment;
  } | null>(null);
  const [voidingRemission, setVoidingRemission] = useState<Remission | null>(
    null,
  );
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const orderQuery = useOrder(orderId ?? '');
  const order = orderQuery.data;

  if (orderQuery.isLoading || !order) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ to: '/pedidos', label: 'Volver a pedidos' }}
          title="Pedido"
        />
        <p className="text-ink-muted text-sm">
          {orderQuery.isLoading ? 'Cargando…' : 'Pedido no encontrado.'}
        </p>
      </div>
    );
  }

  const canDispatch = isAdmin && order.status === 'EN_ALMACEN';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: '/pedidos', label: 'Volver a pedidos' }}
        eyebrow={`Pedido #${order.number}`}
        title={order.customer.name}
        meta={
          <>
            <OrderStatusBadge status={order.status} />
            <span className="inline-flex items-center gap-1.5">
              <Warehouse className="h-3.5 w-3.5" />
              {order.warehouse.name}
            </span>
            <span>Creado el {formatDate(order.createdAt)}</span>
          </>
        }
        actions={
          isAdmin && (
            <>
              {order.status !== 'CANCELADO' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsTrackingModalOpen(true)}
                >
                  <Pencil />
                  Editar seguimiento
                </Button>
              )}
              <OrderStatusActions order={order} />
            </>
          )
        }
      />

      <Card className="px-6 py-5">
        <OrderTimeline order={order} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <div className="px-5 pt-4">
              <CardHeader title="Productos" />
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-line bg-chrome border-y">
                  {['Producto', 'Entregado', 'Precio', 'Subtotal'].map(
                    (header, index) => (
                      <th
                        key={header}
                        className={`text-ink-muted px-5 py-2.5 text-[11px] font-semibold tracking-[0.08em] uppercase ${
                          index > 0 ? 'text-right' : ''
                        }`}
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const delivered = deliveredFor(order, item.id);
                  const ratio = Math.min(1, delivered / Number(item.quantity));
                  return (
                    <tr
                      key={item.id}
                      className="border-line border-b last:border-b-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink font-medium">
                          {item.product.name}
                        </p>
                        <p className="figures text-ink-faint text-xs">
                          {item.product.sku}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="figures text-ink">
                          {formatQuantity(delivered)}
                        </span>
                        <span className="figures text-ink-faint">
                          {' '}
                          / {formatQuantity(item.quantity)}
                        </span>
                        <div className="bg-chrome-strong mt-1.5 ml-auto h-1 w-20 overflow-hidden rounded-full">
                          <div
                            className={`h-full rounded-full ${ratio >= 1 ? 'bg-success' : 'bg-accent'}`}
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="figures text-ink-secondary px-5 py-3 text-right">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="figures text-ink px-5 py-3 text-right font-medium">
                        {formatMoney(
                          Number(item.quantity) * Number(item.unitPrice),
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-line bg-chrome/60 border-t">
                  <td
                    colSpan={3}
                    className="text-ink-muted px-5 py-3 text-right text-[13px] font-medium"
                  >
                    Total del pedido
                  </td>
                  <td className="figures text-ink px-5 py-3 text-right text-base font-semibold">
                    {formatMoney(orderTotal(order))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-ink text-[15px] font-semibold tracking-tight">
                  Remisiones
                </h2>
                <p className="text-ink-muted text-[13px]">
                  Cada despacho, con lo que se cobró de él.
                </p>
              </div>
              {canDispatch && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsRemissionModalOpen(true)}
                >
                  <Plus />
                  Nueva remisión
                </Button>
              )}
            </div>

            {order.remissions.length === 0 ? (
              <div className="border-line text-ink-muted rounded-xl border border-dashed px-5 py-8 text-center text-sm">
                Todavía no se ha despachado nada de este pedido.
                {order.status !== 'EN_ALMACEN' &&
                  order.status !== 'CANCELADO' && (
                    <p className="text-ink-faint mt-1 text-xs">
                      Se puede despachar cuando el pedido llegue a almacén.
                    </p>
                  )}
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {order.remissions.map((remission) => (
                  <RemissionCard
                    key={remission.id}
                    order={order}
                    remission={remission}
                    isAdmin={isAdmin}
                    onAddPayment={setPayingRemission}
                    onVoidPayment={(r, payment) =>
                      setVoidingPayment({ remission: r, payment })
                    }
                    onVoid={setVoidingRemission}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <CollectionCard order={order} />
          <Card className="p-5">
            <CardHeader title="Entrega" />
            <div className="flex flex-col gap-4 text-[13px]">
              <div className="flex flex-col gap-1.5">
                <span className="text-ink-muted inline-flex items-center gap-1.5 text-xs">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Fecha de envío estimada
                </span>
                <DeliveryDate order={order} />
              </div>
              {order.dispatchedAt && (
                <div className="flex flex-col gap-1">
                  <span className="text-ink-muted text-xs">Despachado</span>
                  <span className="text-ink">
                    {formatDateTime(order.dispatchedAt)}
                  </span>
                </div>
              )}
              <div className="border-line flex flex-col gap-1.5 border-t pt-4">
                <span className="text-ink-muted inline-flex items-center gap-1.5 text-xs">
                  <StickyNote className="h-3.5 w-3.5" />
                  Notas
                </span>
                <p
                  className={`whitespace-pre-line ${order.notes ? 'text-ink' : 'text-ink-faint'}`}
                >
                  {order.notes ?? 'Sin notas.'}
                </p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {isRemissionModalOpen && (
        <Modal
          title="Nueva remisión"
          description={`Pedido #${order.number} · ${order.customer.name}`}
          size="lg"
          onClose={() => setIsRemissionModalOpen(false)}
        >
          <RemissionForm
            order={order}
            onSuccess={() => setIsRemissionModalOpen(false)}
          />
        </Modal>
      )}

      {isTrackingModalOpen && (
        <Modal
          title="Editar seguimiento"
          description={`Pedido #${order.number}`}
          onClose={() => setIsTrackingModalOpen(false)}
        >
          <EditOrderTrackingForm
            order={order}
            onSuccess={() => setIsTrackingModalOpen(false)}
          />
        </Modal>
      )}

      {payingRemission && (
        <Modal
          title="Registrar abono"
          description={`Remisión No. ${payingRemission.number} · ${order.customer.name}`}
          onClose={() => setPayingRemission(null)}
        >
          <AddPaymentForm
            orderId={order.id}
            remission={payingRemission}
            onSuccess={() => setPayingRemission(null)}
          />
        </Modal>
      )}

      {voidingPayment && (
        <Modal
          title="Anular abono"
          description={`Remisión No. ${voidingPayment.remission.number}`}
          onClose={() => setVoidingPayment(null)}
        >
          <VoidPaymentForm
            orderId={order.id}
            remissionId={voidingPayment.remission.id}
            payment={voidingPayment.payment}
            onSuccess={() => setVoidingPayment(null)}
          />
        </Modal>
      )}

      {voidingRemission && (
        <Modal
          title={`Anular remisión No. ${voidingRemission.number}`}
          onClose={() => setVoidingRemission(null)}
        >
          <VoidRemissionForm
            orderId={order.id}
            remission={voidingRemission}
            onSuccess={() => setVoidingRemission(null)}
          />
        </Modal>
      )}
    </div>
  );
}

export default OrderDetailPage;
