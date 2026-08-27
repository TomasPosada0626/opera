import { useEffect } from 'react';
import { Link } from 'react-router';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';
import { useWarehouses } from '../../hooks/useWarehouses';

interface WarehouseSelectProps {
  registration: UseFormRegisterReturn;
  error?: FieldError;
  // El formulario padre pasa `(id) => setValue('warehouseId', id)` — este
  // componente no tiene acceso al `setValue` de react-hook-form del padre,
  // así que la única forma de fijar el valor automáticamente es que el
  // padre lo haga por su cuenta cuando se lo pidamos.
  onAutoSelect?: (warehouseId: string) => void;
}

// Mismo campo repetido igual en MovementForm, OrderForm y
// ProductionOrderForm — sin esto, cada uno manejaba el estado de la
// consulta a su manera (o no lo manejaba: si `useWarehouses()` fallaba o
// devolvía cero bodegas, el select se quedaba mudo en "Selecciona una
// bodega" sin ninguna pista de qué pasó ni qué hacer).
//
// La mayoría de negocios que usan Opera operan desde un solo lugar (ver
// PRODUCT.md) — obligar a elegir entre una sola opción en cada formulario
// es fricción sin ningún propósito real. Con exactamente una bodega
// activa, este campo se autoselecciona y queda oculto; con 0 o 2+, se
// comporta como un select normal. El modelo de datos sigue soportando
// varias bodegas para cuando el negocio crezca — esto es una decisión de
// presentación, no una limitación del schema.
export function WarehouseSelect({
  registration,
  error,
  onAutoSelect,
}: WarehouseSelectProps) {
  const warehousesQuery = useWarehouses();
  const warehouses = warehousesQuery.data?.data ?? [];
  const onlyWarehouse = warehouses.length === 1 ? warehouses[0] : undefined;

  useEffect(() => {
    if (onlyWarehouse) {
      onAutoSelect?.(onlyWarehouse.id);
    }
    // Solo cuando cambia CUÁL es la única bodega (o deja de serlo) — no en
    // cada render, y `onAutoSelect` normalmente es una función nueva por
    // render (setValue envuelto en un arrow inline en el padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyWarehouse?.id]);

  if (onlyWarehouse) {
    // Sin `value` explícito a propósito: `onAutoSelect` ya deja el valor
    // en el estado de react-hook-form vía `setValue`, que actualiza este
    // input registrado por su `ref` — ponerle además un `value` de React
    // lo volvería un input controlado peleando con el manejo interno de
    // RHF.
    return <input type="hidden" {...registration} />;
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={registration.name}
        className="text-ink-muted text-sm font-medium"
      >
        Bodega
      </label>
      <select
        id={registration.name}
        {...registration}
        disabled={warehousesQuery.isLoading}
        className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-60"
        aria-invalid={!!error}
      >
        <option value="">
          {warehousesQuery.isLoading
            ? 'Cargando bodegas...'
            : 'Selecciona una bodega'}
        </option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>
      {error && <p className="text-danger text-xs">{error.message}</p>}
      {warehousesQuery.isError && (
        <p role="alert" className="text-danger text-xs">
          No se pudieron cargar las bodegas. Intenta de nuevo.
        </p>
      )}
      {!warehousesQuery.isLoading &&
        !warehousesQuery.isError &&
        warehouses.length === 0 && (
          <p className="text-warning text-xs">
            No hay bodegas registradas —{' '}
            <Link to="/bodegas" className="underline">
              créala primero en Bodegas
            </Link>
            .
          </p>
        )}
    </div>
  );
}
