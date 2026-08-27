import { useState } from 'react';
import { ArrowLeft, Ban, Download, Pencil, Plus, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { EditRemissionPaymentForm } from '../components/orders/EditRemissionPaymentForm';
import { OrderStatusActions } from '../components/orders/OrderStatusActions';
import { RemissionForm } from '../components/orders/RemissionForm';
import { VoidRemissionForm } from '../components/orders/VoidRemissionForm';
import { useOrder } from '../hooks/useOrder';
import { downloadFile } from '../lib/download-file';
import { getCurrentUser } from '../lib/current-user';
import type {
  Order,
  OrderStatus,
  Remission,
  RemissionPaymentStatus,
} from '../types/order';

const statusBadgeVariant: Record<
  OrderStatus,
  'success' | 'warning' | 'danger'
> = {
  PENDIENTE: 'warning',
  EN_PRODUCCION: 'warning',
  EN_ALMACEN: 'success',
  CANCELADO: 'danger',
};

const statusLabel: Record<OrderStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PRODUCCION: 'En producción',
  EN_ALMACEN: 'En almacén',
  CANCELADO: 'Cancelado',
};

const paymentStatusBadgeVariant: Record<
  RemissionPaymentStatus,
  'success' | 'warning' | 'danger'
> = {
  PAGADO: 'success',
  ABONADO: 'warning',
  CARTERA: 'danger',
};

const paymentStatusLabel: Record<RemissionPaymentStatus, string> = {
  PAGADO: 'Pagó',
  ABONADO: 'Abonó',
  CARTERA: 'Cartera',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' });
}

// Excluye remisiones anuladas (#99) — su ENTRADA de reverso ya corrigió el
// stock, así que esa cantidad deja de contar como entregada.
function deliveredFor(order: Order, orderItemId: string): number {
  return order.remissions
    .filter((remission) => !remission.voidedAt)
    .reduce(
      (sum, remission) =>
        sum +
        remission.items
          .filter((item) => item.orderItemId === orderItemId)
          .reduce((lineSum, item) => lineSum + Number(item.quantity), 0),
      0,
    );
}

async function downloadRemissionPdf(remissionId: string, number: number) {
  await downloadFile(
    `/remissions/${remissionId}/pdf`,
    `remision-${number}.pdf`,
  );
}

function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [isRemissionModalOpen, setIsRemissionModalOpen] = useState(false);
  const [editingPaymentRemission, setEditingPaymentRemission] =
    useState<Remission | null>(null);
  const [voidingRemission, setVoidingRemission] = useState<Remission | null>(
    null,
  );
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const orderQuery = useOrder(orderId ?? '');
  const order = orderQuery.data;

  const total = order
    ? order.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
        0,
      )
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/pedidos"
          className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a pedidos
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-ink text-xl font-medium">
              {order ? order.customer.name : 'Pedido'}
            </h1>
            {order && (
              <Badge variant={statusBadgeVariant[order.status]}>
                {statusLabel[order.status]}
              </Badge>
            )}
          </div>
          {order && isAdmin && <OrderStatusActions order={order} />}
        </div>
        {order && (
          <p className="text-ink-muted mt-1 text-sm">
            {formatDate(order.createdAt)} — {order.warehouse.name}
          </p>
        )}
      </div>

      {orderQuery.isLoading && (
        <p className="text-ink-muted text-sm">Cargando…</p>
      )}

      {order && (
        <>
          <Card className="p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-line bg-chrome-strong border-b">
                  <th className="text-ink-muted px-4 py-3 text-xs font-medium tracking-wide uppercase">
                    Producto
                  </th>
                  <th className="text-ink-muted px-4 py-3 text-right text-xs font-medium tracking-wide uppercase">
                    Cantidad
                  </th>
                  <th className="text-ink-muted px-4 py-3 text-right text-xs font-medium tracking-wide uppercase">
                    Entregado
                  </th>
                  <th className="text-ink-muted px-4 py-3 text-right text-xs font-medium tracking-wide uppercase">
                    Precio unitario
                  </th>
                  <th className="text-ink-muted px-4 py-3 text-right text-xs font-medium tracking-wide uppercase">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-line border-b last:border-b-0"
                  >
                    <td className="text-ink px-4 py-3">
                      {item.product.sku} — {item.product.name}
                    </td>
                    <td className="text-ink px-4 py-3 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="text-ink-muted px-4 py-3 text-right tabular-nums">
                      {deliveredFor(order, item.id)}
                    </td>
                    <td className="text-ink px-4 py-3 text-right tabular-nums">
                      {Number(item.unitPrice).toLocaleString('es-CO', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="text-ink px-4 py-3 text-right tabular-nums">
                      {(
                        Number(item.quantity) * Number(item.unitPrice)
                      ).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    colSpan={4}
                    className="text-ink-muted px-4 py-3 text-right text-sm font-medium"
                  >
                    Total
                  </td>
                  <td className="text-ink px-4 py-3 text-right text-sm font-medium tabular-nums">
                    {total.toLocaleString('es-CO', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-ink text-lg font-medium">Remisiones</h2>
              {isAdmin && (
                <Button
                  variant="secondary"
                  onClick={() => setIsRemissionModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Nueva remisión
                </Button>
              )}
            </div>

            {order.remissions.length === 0 ? (
              <p className="text-ink-muted text-sm">
                Todavía no se ha despachado nada de este pedido.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {order.remissions.map((remission) => (
                  <li
                    key={remission.id}
                    className="border-line bg-surface-raised flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-ink text-sm font-medium">
                          Remisión No. {remission.number}
                        </p>
                        {remission.voidedAt ? (
                          <Badge variant="danger">Anulada</Badge>
                        ) : (
                          <Badge
                            variant={
                              paymentStatusBadgeVariant[remission.paymentStatus]
                            }
                          >
                            {paymentStatusLabel[remission.paymentStatus]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-ink-muted text-xs">
                        {formatDate(remission.createdAt)} —{' '}
                        {remission.user.name}
                      </p>
                      {remission.voidedAt && (
                        <p className="text-ink-muted mt-0.5 text-xs italic">
                          Motivo: {remission.voidReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {isAdmin && !remission.voidedAt && (
                        <Button
                          variant="ghost"
                          onClick={() => setEditingPaymentRemission(remission)}
                          className="px-3 py-1.5"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar pago
                        </Button>
                      )}
                      {isAdmin && !remission.voidedAt && (
                        <Button
                          variant="ghost"
                          onClick={() => setVoidingRemission(remission)}
                          className="px-3 py-1.5"
                        >
                          <Ban className="h-4 w-4" />
                          Anular
                        </Button>
                      )}
                      <Link
                        to={`/imprimir-remision?id=${remission.id}`}
                        className="text-ink hover:bg-chrome-strong flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
                      >
                        <Printer className="h-4 w-4" />
                        Imprimir
                      </Link>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void downloadRemissionPdf(
                            remission.id,
                            remission.number,
                          )
                        }
                        className="px-3 py-1.5"
                      >
                        <Download className="h-4 w-4" />
                        Descargar PDF
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isRemissionModalOpen && (
            <Modal
              title="Nueva remisión"
              onClose={() => setIsRemissionModalOpen(false)}
            >
              <RemissionForm
                order={order}
                onSuccess={() => setIsRemissionModalOpen(false)}
              />
            </Modal>
          )}

          {editingPaymentRemission && (
            <Modal
              title="Editar pago"
              onClose={() => setEditingPaymentRemission(null)}
            >
              <EditRemissionPaymentForm
                orderId={order.id}
                remission={editingPaymentRemission}
                onSuccess={() => setEditingPaymentRemission(null)}
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
        </>
      )}
    </div>
  );
}

export default OrderDetailPage;
