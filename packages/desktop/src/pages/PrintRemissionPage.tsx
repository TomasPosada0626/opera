import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Printer, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useRemission } from '../hooks/useRemission';
import { apiFetch, ApiError } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { RemissionDetail } from '../types/order';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'long' });
}

// Standalone (fuera de AppLayout, sin sidebar/topbar) para que no haya nada
// que ocultar con @media print — la página entera es la superficie
// imprimible salvo la barra de búsqueda, que ya lleva su propia
// data-print="hide".
function PrintRemissionPage() {
  const [searchParams] = useSearchParams();
  const idFromLink = searchParams.get('id') ?? '';
  const [remissionId, setRemissionId] = useState(idFromLink);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const remissionQuery = useRemission(remissionId);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!searchTerm.trim()) {
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const result = await apiFetch<PaginatedResult<RemissionDetail>>(
        `/remissions?search=${encodeURIComponent(searchTerm.trim())}&pageSize=1`,
      );
      if (result.data.length === 0) {
        setSearchError(`No existe la remisión No. ${searchTerm.trim()}`);
        return;
      }
      setRemissionId(result.data[0].id);
    } catch (error) {
      setSearchError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo buscar la remisión.',
      );
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="bg-surface text-ink min-h-screen">
      <div
        data-print="hide"
        className="border-line bg-surface-raised sticky top-0 z-10 border-b p-4 print:hidden"
      >
        <div className="mx-auto flex max-w-2xl flex-wrap items-end justify-between gap-4">
          <Link
            to="/"
            className="text-ink-muted hover:text-ink flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <form
            onSubmit={(event) => void handleSearch(event)}
            className="flex items-end gap-2"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="remission-search"
                className="text-ink-muted text-sm font-medium"
              >
                Buscar remisión por número
              </label>
              <input
                id="remission-search"
                type="text"
                inputMode="numeric"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 outline-none focus:ring-2"
              />
            </div>
            <Button type="submit" disabled={isSearching}>
              <Search className="h-4 w-4" />
              Buscar
            </Button>
          </form>
        </div>
        {searchError && (
          <p
            role="alert"
            className="text-danger mx-auto max-w-2xl pt-2 text-sm"
          >
            {searchError}
          </p>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-6 py-10">
        {!remissionId && (
          <p className="text-ink-muted text-center">
            Busca una remisión por su número para verla e imprimirla.
          </p>
        )}

        {remissionId && remissionQuery.isLoading && (
          <p className="text-ink-muted text-center">Cargando remisión…</p>
        )}

        {remissionId && remissionQuery.isError && (
          <p role="alert" className="text-danger text-center">
            {remissionQuery.error instanceof ApiError &&
            remissionQuery.error.statusCode === 404
              ? 'Esa remisión no existe.'
              : 'No se pudo cargar la remisión.'}
          </p>
        )}

        {remissionQuery.data && (
          <RemissionPrintView remission={remissionQuery.data} />
        )}
      </div>
    </div>
  );
}

function RemissionPrintView({ remission }: { remission: RemissionDetail }) {
  return (
    <div>
      <div data-print="hide" className="mb-6 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {remission.voidedAt && (
        <p
          data-print="hide"
          className="bg-danger-surface text-danger mb-6 rounded-md px-3 py-2 text-sm print:hidden"
        >
          Esta remisión está anulada. Se puede imprimir como referencia
          histórica, pero no representa una entrega vigente.
        </p>
      )}

      <div className="border-line rounded-xl border p-8 print:border-none print:p-0">
        <h1 className="text-center text-xl font-medium">Remisión</h1>
        <div className="mt-6 space-y-1 text-sm">
          <p>
            <span className="text-ink-muted">No.</span> {remission.number}
          </p>
          <p>
            <span className="text-ink-muted">Fecha:</span>{' '}
            {formatDate(remission.createdAt)}
          </p>
          <p>
            <span className="text-ink-muted">Cliente:</span>{' '}
            {remission.order.customer.name}
          </p>
          <p>
            <span className="text-ink-muted">Bodega:</span>{' '}
            {remission.order.warehouse.name}
          </p>
          <p>
            <span className="text-ink-muted">Entregado por:</span>{' '}
            {remission.user.name}
          </p>
        </div>

        {/* Sin estado de pago a propósito, igual que el PDF (#54) — es dato
            interno del negocio, nunca algo que vea el cliente en el
            documento que se lleva. */}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-line border-b text-left">
              <th className="py-2 font-medium">Producto</th>
              <th className="py-2 text-right font-medium">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {remission.items.map((item) => (
              <tr key={item.id} className="border-line border-b">
                <td className="py-2">
                  {item.orderItem.product.sku} — {item.orderItem.product.name}
                </td>
                <td className="py-2 text-right">{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PrintRemissionPage;
