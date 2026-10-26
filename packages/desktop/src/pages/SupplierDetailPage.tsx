import { useState } from 'react';
import {
  FileSpreadsheet,
  HandCoins,
  Mail,
  PackageOpen,
  Phone,
  Plus,
  Wallet,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { DetailLink } from '../components/ui/DetailLink';
import { KPICard } from '../components/ui/KPICard';
import { DeleteSupplierProductAction } from '../components/suppliers/DeleteSupplierProductAction';
import { SupplierProductForm } from '../components/suppliers/SupplierProductForm';
import {
  PurchaseStatusBadge,
  SupplierPaymentBadge,
} from '../components/purchases/PurchaseBadges';
import { PurchaseOrderForm } from '../components/purchases/PurchaseOrderForm';
import { useSupplier } from '../hooks/useSupplier';
import { useSupplierProducts } from '../hooks/useSupplierProducts';
import {
  usePurchaseOrders,
  useSupplierBalance,
} from '../hooks/usePurchaseOrders';
import { getCurrentUser } from '../lib/current-user';
import { downloadFile } from '../lib/download-file';
import { formatDate, formatMoney } from '../lib/format';

function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;
  const navigate = useNavigate();

  const supplierQuery = useSupplier(supplierId ?? '');
  const supplier = supplierQuery.data;
  const productsQuery = useSupplierProducts({ supplierId: supplierId ?? '' });
  const purchasesQuery = usePurchaseOrders({
    page: 1,
    pageSize: 20,
    supplierId: supplierId ?? undefined,
  });
  const balanceQuery = useSupplierBalance(supplierId ?? '');
  const balance = balanceQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: '/proveedores', label: 'Volver a proveedores' }}
        eyebrow="Proveedor"
        title={supplier ? supplier.name : 'Proveedor'}
        meta={
          supplier && (
            <>
              <Badge variant={supplier.isActive ? 'success' : 'danger'} dot>
                {supplier.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
              {supplier.taxId && (
                <span className="figures">NIT {supplier.taxId}</span>
              )}
              {supplier.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {supplier.phone}
                </span>
              )}
              {supplier.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {supplier.email}
                </span>
              )}
            </>
          )
        }
        actions={
          supplier && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void downloadFile(
                  `/suppliers/${supplier.id}/export`,
                  `proveedor-${supplier.id}.xlsx`,
                )
              }
            >
              <FileSpreadsheet />
              Exportar datos
            </Button>
          )
        }
      />

      {supplierQuery.isLoading && (
        <p className="text-ink-muted text-sm">Cargando…</p>
      )}

      {supplier && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPICard
              icon={HandCoins}
              label="Por pagar"
              value={balance ? formatMoney(balance.payable) : '—'}
              hint="De lo que ya llegó"
              variant={
                balance && Number(balance.payable) > 0 ? 'danger' : 'neutral'
              }
            />
            <KPICard
              icon={PackageOpen}
              label="Comprado"
              value={balance ? formatMoney(balance.totalPurchased) : '—'}
              hint={
                balance
                  ? `Recibido: ${formatMoney(balance.totalReceived)}`
                  : undefined
              }
              variant="neutral"
            />
            <KPICard
              icon={Wallet}
              label="Pagado"
              value={balance ? formatMoney(balance.totalPaid) : '—'}
              variant="neutral"
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-ink text-lg font-medium">
                Precios por producto
              </h2>
              {isAdmin && (
                <Button
                  variant="secondary"
                  onClick={() => setIsPriceModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Agregar precio
                </Button>
              )}
            </div>

            {productsQuery.data?.data.length === 0 ? (
              <p className="text-ink-muted text-sm">
                Todavía no hay precios registrados para este proveedor.
              </p>
            ) : (
              <Card className="p-0">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-line bg-chrome-strong border-b">
                      <th className="text-ink-muted px-4 py-3 text-xs font-medium tracking-wide uppercase">
                        Producto
                      </th>
                      <th className="text-ink-muted px-4 py-3 text-right text-xs font-medium tracking-wide uppercase">
                        Precio
                      </th>
                      {isAdmin && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {productsQuery.data?.data.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-line border-b last:border-b-0"
                      >
                        <td className="text-ink px-4 py-3">
                          {entry.product.sku} — {entry.product.name}
                        </td>
                        <td className="text-ink px-4 py-3 text-right figures">
                          {formatMoney(entry.price)}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <DeleteSupplierProductAction id={entry.id} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-ink text-lg font-medium">Compras</h2>
              {isAdmin && supplier.isActive && (
                <Button
                  variant="secondary"
                  onClick={() => setIsPurchaseModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Nueva compra
                </Button>
              )}
            </div>

            {purchasesQuery.data?.data.length === 0 ? (
              <p className="text-ink-muted text-sm">
                Todavía no hay compras registradas para este proveedor.
              </p>
            ) : (
              <Card className="p-0">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-line bg-chrome-strong text-ink-muted border-b text-[11px] font-semibold tracking-[0.08em] uppercase">
                      <th className="px-4 py-3">Compra</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Pago</th>
                      <th className="w-10 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {purchasesQuery.data?.data.map((purchase) => (
                      <tr
                        key={purchase.id}
                        className="border-line border-b last:border-b-0"
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/compras/${purchase.id}`}
                            className="text-ink hover:text-accent figures font-semibold transition-colors"
                          >
                            #{purchase.number}
                          </Link>
                          <p className="text-ink-faint text-xs whitespace-nowrap">
                            {formatDate(purchase.purchasedAt)} ·{' '}
                            {purchase.items.length === 1
                              ? purchase.items[0].product.name
                              : `${purchase.items.length} productos`}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <PurchaseStatusBadge status={purchase.status} />
                        </td>
                        <td className="figures text-ink px-4 py-3 text-right font-medium whitespace-nowrap">
                          {formatMoney(purchase.total)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <SupplierPaymentBadge
                              status={purchase.paymentStatus}
                            />
                            {Number(purchase.payable) > 0 && (
                              <span className="figures text-danger text-xs whitespace-nowrap">
                                Debe {formatMoney(purchase.payable)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DetailLink
                            to={`/compras/${purchase.id}`}
                            label={`Ver detalle de la compra ${purchase.number}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          {isPriceModalOpen && (
            <Modal
              title="Agregar precio"
              onClose={() => setIsPriceModalOpen(false)}
            >
              <SupplierProductForm
                supplierId={supplier.id}
                onSuccess={() => setIsPriceModalOpen(false)}
              />
            </Modal>
          )}

          {isPurchaseModalOpen && (
            <Modal
              title="Nueva compra"
              description={`${supplier.name} · El inventario no se mueve hasta recibir la mercancía.`}
              size="lg"
              onClose={() => setIsPurchaseModalOpen(false)}
            >
              <PurchaseOrderForm
                supplierId={supplier.id}
                onSuccess={(order) => {
                  setIsPurchaseModalOpen(false);
                  void navigate(`/compras/${order.id}`);
                }}
              />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

export default SupplierDetailPage;
