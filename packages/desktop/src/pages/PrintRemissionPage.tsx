import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Printer, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useRemission } from '../hooks/useRemission';
import { useHasSeveralWarehouses } from '../hooks/useWarehouses';
import { apiFetch, ApiError } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { RemissionDetail } from '../types/order';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'long' });
}

function formatQuantity(value: string): string {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 3 });
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
                className="text-ink-secondary text-[13px] font-medium"
              >
                Buscar remisión por número
              </label>
              <input
                id="remission-search"
                type="text"
                inputMode="numeric"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="field h-9 px-3"
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
  const showWarehouses = useHasSeveralWarehouses();
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

      <article className="border-line bg-surface-raised rounded-2xl border p-10 shadow-sm print:rounded-none print:border-none print:p-0 print:shadow-none">
        <header className="border-ink flex items-start justify-between gap-6 border-b-2 pb-6">
          <div>
            <h1 className="text-[28px] leading-none font-semibold tracking-[-0.02em]">
              Remisión
            </h1>
            <p className="text-ink-muted mt-2 text-sm">
              Documento de entrega de mercancía
            </p>
          </div>
          <div className="text-right">
            <p className="text-ink-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
              No.
            </p>
            <p className="figures text-[32px] leading-none font-semibold">
              {remission.number}
            </p>
          </div>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-x-10 gap-y-4 text-sm">
          {[
            ['Cliente', remission.order.customer.name],
            ['Fecha', formatDate(remission.createdAt)],
            ['Pedido', `No. ${remission.order.number}`],
            ...(showWarehouses
              ? [['Bodega', remission.order.warehouse.name]]
              : []),
            ['Entregado por', remission.user.name],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-ink-muted text-[11px] font-semibold tracking-[0.1em] uppercase">
                {label}
              </dt>
              <dd className="text-ink font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Sin estado de pago a propósito, igual que el PDF (#54) — es dato
            interno del negocio, nunca algo que vea el cliente en el
            documento que se lleva. */}
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-ink border-b text-left">
              <th className="text-ink-muted w-10 py-2 text-[11px] font-semibold tracking-[0.1em] uppercase">
                #
              </th>
              <th className="text-ink-muted py-2 text-[11px] font-semibold tracking-[0.1em] uppercase">
                Producto
              </th>
              <th className="text-ink-muted py-2 text-right text-[11px] font-semibold tracking-[0.1em] uppercase">
                Cantidad
              </th>
            </tr>
          </thead>
          <tbody>
            {remission.items.map((item, index) => (
              <tr key={item.id} className="border-line border-b">
                <td className="figures text-ink-faint py-3">{index + 1}</td>
                <td className="py-3">
                  {item.orderItem.product.sku} — {item.orderItem.product.name}
                </td>
                <td className="figures py-3 text-right font-medium">
                  {formatQuantity(item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Constancia de recibido: la práctica comercial de una remisión
            es que quien recibe firme la copia que se queda en el taller. */}
        <div className="mt-20 grid grid-cols-2 gap-12 text-sm">
          {['Entregado por', 'Recibido por (nombre, cédula y firma)'].map(
            (label) => (
              <div key={label} className="flex flex-col gap-2">
                <div className="border-ink h-12 border-b" />
                <span className="text-ink-muted text-xs">{label}</span>
              </div>
            ),
          )}
        </div>
      </article>
    </div>
  );
}

export default PrintRemissionPage;
