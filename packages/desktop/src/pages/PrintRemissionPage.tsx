import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Printer, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { RemissionSheet } from '../components/orders/RemissionSheet';
import { useRemission } from '../hooks/useRemission';
import { apiFetch, ApiError } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { RemissionDetail } from '../types/order';

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
        setSearchError(`No existe la remisión ${searchTerm.trim()}`);
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
    <div className="bg-surface text-ink min-h-screen print:min-h-0 print:bg-white">
      <div
        data-print="hide"
        className="border-line bg-surface-raised sticky top-0 z-10 border-b p-4 print:hidden"
      >
        <div className="mx-auto flex max-w-[832px] flex-wrap items-end justify-between gap-4">
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
                placeholder="HT 3286"
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
            className="text-danger mx-auto max-w-[832px] pt-2 text-sm"
          >
            {searchError}
          </p>
        )}
      </div>

      <div className="mx-auto max-w-[880px] px-6 py-10 print:m-0 print:max-w-none print:p-0">
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

// La hoja con las dos copias (cliente arriba, empresa abajo) es lo único que
// sale impreso: el botón y el aviso de anulada llevan print:hidden.
function RemissionPrintView({ remission }: { remission: RemissionDetail }) {
  return (
    <div>
      <div
        data-print="hide"
        className="mb-6 flex items-center justify-between gap-4 print:hidden"
      >
        <p className="text-ink-muted text-[13px]">
          Hoja carta vertical: copia del cliente arriba y de la empresa abajo.
          Córtala por la línea punteada.
        </p>
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

      <RemissionSheet remission={remission} />
    </div>
  );
}

export default PrintRemissionPage;
