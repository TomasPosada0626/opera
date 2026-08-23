import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { SupplierProductForm } from '../components/suppliers/SupplierProductForm';
import { SupplierPurchaseForm } from '../components/suppliers/SupplierPurchaseForm';
import { useSupplier } from '../hooks/useSupplier';
import { useSupplierProducts } from '../hooks/useSupplierProducts';
import { useSupplierPurchases } from '../hooks/useSupplierPurchases';
import { getCurrentUser } from '../lib/current-user';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' });
}

function formatMoney(value: string): string {
  return Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2 });
}

function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const supplierQuery = useSupplier(supplierId ?? '');
  const supplier = supplierQuery.data;
  const productsQuery = useSupplierProducts({ supplierId: supplierId ?? '' });
  const purchasesQuery = useSupplierPurchases({
    supplierId: supplierId ?? '',
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/proveedores"
          className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a proveedores
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-ink text-xl font-medium">
            {supplier ? supplier.name : 'Proveedor'}
          </h1>
          {supplier && (
            <Badge variant={supplier.isActive ? 'success' : 'danger'}>
              {supplier.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
          )}
        </div>
      </div>

      {supplierQuery.isLoading && (
        <p className="text-ink-muted text-sm">Cargando…</p>
      )}

      {supplier && (
        <>
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
                        <td className="text-ink px-4 py-3 text-right tabular-nums">
                          {formatMoney(entry.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-ink text-lg font-medium">
                Bitácora de compras
              </h2>
              {isAdmin && (
                <Button
                  variant="secondary"
                  onClick={() => setIsPurchaseModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Registrar compra
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
                    <tr className="border-line bg-chrome-strong border-b">
                      <th className="text-ink-muted px-4 py-3 text-xs font-medium tracking-wide uppercase">
                        Fecha
                      </th>
                      <th className="text-ink-muted px-4 py-3 text-xs font-medium tracking-wide uppercase">
                        Producto
                      </th>
                      <th className="text-ink-muted px-4 py-3 text-right text-xs font-medium tracking-wide uppercase">
                        Cantidad
                      </th>
                      <th className="text-ink-muted px-4 py-3 text-right text-xs font-medium tracking-wide uppercase">
                        Costo unitario
                      </th>
                      <th className="text-ink-muted px-4 py-3 text-xs font-medium tracking-wide uppercase">
                        Registrado por
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasesQuery.data?.data.map((purchase) => (
                      <tr
                        key={purchase.id}
                        className="border-line border-b last:border-b-0"
                      >
                        <td className="text-ink px-4 py-3">
                          {formatDate(purchase.purchasedAt)}
                        </td>
                        <td className="text-ink px-4 py-3">
                          {purchase.product.sku} — {purchase.product.name}
                        </td>
                        <td className="text-ink px-4 py-3 text-right tabular-nums">
                          {purchase.quantity}
                        </td>
                        <td className="text-ink px-4 py-3 text-right tabular-nums">
                          {formatMoney(purchase.unitCost)}
                        </td>
                        <td className="text-ink-muted px-4 py-3">
                          {purchase.user.name}
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
              title="Registrar compra"
              onClose={() => setIsPurchaseModalOpen(false)}
            >
              <SupplierPurchaseForm
                supplierId={supplier.id}
                onSuccess={() => setIsPurchaseModalOpen(false)}
              />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

export default SupplierDetailPage;
