import {
  ArrowRight,
  FileSpreadsheet,
  HandCoins,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ShoppingBag,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { KPICard } from '../components/ui/KPICard';
import { PageHeader } from '../components/ui/PageHeader';
import {
  DeliveryDate,
  OrderStatusBadge,
} from '../components/orders/OrderBadges';
import { useCustomer } from '../hooks/useCustomer';
import { useCustomerBalance } from '../hooks/useCustomerBalance';
import { useCustomerPayments } from '../hooks/useCustomerPayments';
import { useOrders } from '../hooks/useOrders';
import { downloadFile } from '../lib/download-file';
import { formatDate, formatMoney } from '../lib/format';
import { formatRemissionNumber } from '../lib/remission-number';
import {
  deliveryState,
  orderTotal,
  PAYMENT_METHOD_LABEL,
} from '../lib/order-status';
import type { Order } from '../types/order';

const PAGE_SIZE = 20;

function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();

  const customerQuery = useCustomer(customerId ?? '');
  const customer = customerQuery.data;
  const balanceQuery = useCustomerBalance(customerId ?? '');
  const paymentsQuery = useCustomerPayments(customerId ?? '');
  const ordersQuery = useOrders({
    page: 1,
    pageSize: PAGE_SIZE,
    customerId: customerId ?? '',
  });
  const orders = ordersQuery.data?.data ?? [];
  const lastOrder = orders[0];
  const balance = balanceQuery.data;

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'number',
      header: 'Pedido',
      render: (order) => (
        <div className="flex flex-col">
          <span className="figures text-ink font-semibold">
            #{order.number}
          </span>
          <span className="text-ink-faint text-xs">
            {formatDate(order.createdAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      key: 'delivery',
      header: 'Envío estimado',
      render: (order) => <DeliveryDate order={order} compact />,
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (order) => (
        <span className="figures font-medium">
          {formatMoney(orderTotal(order))}
        </span>
      ),
    },
    {
      key: 'detail',
      header: '',
      className: 'text-right',
      render: (order) => (
        <Link
          to={`/pedidos/${order.id}`}
          className="text-ink-muted hover:text-accent hover:bg-accent-surface group inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200"
        >
          Ver detalle
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: '/clientes', label: 'Volver a clientes' }}
        eyebrow="Cliente"
        title={customer ? customer.name : 'Cliente'}
        meta={
          customer && (
            <>
              <Badge variant={customer.isActive ? 'success' : 'danger'} dot>
                {customer.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
              {customer.taxId && (
                <span className="figures">NIT {customer.taxId}</span>
              )}
              {customer.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {customer.email}
                </span>
              )}
              {customer.mobile && (
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  {customer.mobile}
                </span>
              )}
              {(customer.address || customer.city || customer.country) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {[customer.address, customer.city, customer.country]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              {customer.zone && <span>Zona {customer.zone}</span>}
              {customer.salesRep && <span>Asesor: {customer.salesRep}</span>}
              {customer.paymentTerms && (
                <span>Pago: {customer.paymentTerms}</span>
              )}
            </>
          )
        }
        actions={
          customer && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void downloadFile(
                  `/customers/${customer.id}/export`,
                  `cliente-${customer.id}.xlsx`,
                )
              }
            >
              <FileSpreadsheet />
              Exportar datos
            </Button>
          )
        }
      />

      {customerQuery.isLoading && (
        <p className="text-ink-muted text-sm">Cargando…</p>
      )}

      {customer && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KPICard
              icon={Wallet}
              label="Saldo pendiente"
              value={balance ? formatMoney(balance.balance) : '—'}
              variant={
                balance && Number(balance.balance) > 0 ? 'danger' : 'success'
              }
            />
            <KPICard
              icon={Receipt}
              label="Despachado"
              value={balance ? formatMoney(balance.totalBilled) : '—'}
              variant="neutral"
            />
            <KPICard
              icon={HandCoins}
              label="Pagado"
              value={balance ? formatMoney(balance.totalPaid) : '—'}
              variant="neutral"
            />
            <KPICard
              icon={ShoppingBag}
              label="Último pedido"
              value={lastOrder ? formatDate(lastOrder.createdAt) : '—'}
              valueKind="text"
              hint={
                ordersQuery.data
                  ? `${ordersQuery.data.meta.total} pedidos en total`
                  : undefined
              }
              variant="neutral"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="flex min-w-0 flex-col gap-3">
              <h2 className="text-ink text-[15px] font-semibold tracking-tight">
                Historial de pedidos
              </h2>
              <DataTable
                columns={columns}
                rows={orders}
                rowKey={(order) => order.id}
                isLoading={ordersQuery.isLoading}
                emptyMessage="Este cliente todavía no tiene pedidos."
                rowTone={(order) =>
                  deliveryState(order).kind === 'overdue' ? 'danger' : undefined
                }
              />
            </section>

            <Card className="p-5">
              <CardHeader
                title="Abonos"
                description="Todos sus pagos, del más reciente al más viejo."
              />
              {(paymentsQuery.data ?? []).length === 0 ? (
                <p className="text-ink-muted py-4 text-center text-sm">
                  {paymentsQuery.isLoading
                    ? 'Cargando…'
                    : 'Todavía no hay abonos registrados.'}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {(paymentsQuery.data ?? []).map((payment) => (
                    <li
                      key={payment.id}
                      className={`border-line flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0 ${
                        payment.voidedAt ? 'text-ink-faint' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-ink text-[13px] font-medium">
                          {PAYMENT_METHOD_LABEL[payment.method]}
                          <span className="text-ink-faint font-normal">
                            {' '}
                            · {formatRemissionNumber(payment.remission.number)}
                          </span>
                        </p>
                        <p className="text-ink-muted truncate text-xs">
                          {formatDate(payment.paidAt)}
                          {payment.voidedAt
                            ? ` · Anulado: ${payment.voidReason ?? ''}`
                            : payment.note
                              ? ` · ${payment.note}`
                              : ''}
                        </p>
                      </div>
                      <span
                        className={`figures shrink-0 text-[13px] font-semibold ${
                          payment.voidedAt ? 'line-through' : 'text-success'
                        }`}
                      >
                        {formatMoney(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default CustomerDetailPage;
