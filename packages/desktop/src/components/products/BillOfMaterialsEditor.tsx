import { useState, type FormEvent } from 'react';
import { Layers, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { FieldError, FormError } from '../form/Field';
import { ProductPicker } from '../inventory/ProductPicker';
import { Button } from '../ui/Button';
import {
  useBillOfMaterials,
  useDeleteBillOfMaterials,
  useSaveBillOfMaterials,
} from '../../hooks/useBillOfMaterials';
import { PRODUCT_TYPE_LABELS, type Product } from '../../types/product';
import type { BillOfMaterialsItem } from '../../types/production';

interface ComponentRef {
  id: string;
  sku: string;
  name: string;
  type: Product['type'];
  unitAbbreviation: string;
}

interface MaterialRow {
  key: string;
  component: ComponentRef | null;
  quantity: string;
}

function rowFromItem(item: BillOfMaterialsItem): MaterialRow {
  return {
    key: item.id,
    component: {
      id: item.component.id,
      sku: item.component.sku,
      name: item.component.name,
      type: item.component.type,
      unitAbbreviation: item.component.unit.abbreviation,
    },
    quantity: String(Number(item.quantity)),
  };
}

function emptyRow(): MaterialRow {
  return { key: crypto.randomUUID(), component: null, quantity: '' };
}

interface BillOfMaterialsEditorProps {
  product: Product;
  onDone: () => void;
}

// Qué lleva UNA unidad del producto terminado. Cuando un pedido de este
// producto pasa a almacén (o se completa una orden de producción), Opera
// descuenta estas cantidades del stock solo y le pone al terminado el
// costo de sus materiales. Sin lista, el producto entra sin descontar
// nada (ver ADR 0009).
export function BillOfMaterialsEditor({
  product,
  onDone,
}: BillOfMaterialsEditorProps) {
  const bomQuery = useBillOfMaterials(product.id);

  if (bomQuery.isLoading || !bomQuery.data) {
    return (
      <div className="text-ink-muted flex items-center justify-center gap-2 py-10 text-sm">
        <Loader2 className="text-accent h-4 w-4 animate-spin" />
        Cargando lista de materiales…
      </div>
    );
  }

  return (
    <EditorForm
      product={product}
      initialRows={
        bomQuery.data.items.length > 0
          ? bomQuery.data.items.map(rowFromItem)
          : [emptyRow()]
      }
      hasSavedList={bomQuery.data.items.length > 0}
      onDone={onDone}
    />
  );
}

function EditorForm({
  product,
  initialRows,
  hasSavedList,
  onDone,
}: {
  product: Product;
  initialRows: MaterialRow[];
  hasSavedList: boolean;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<MaterialRow[]>(initialRows);
  const [formError, setFormError] = useState<string | null>(null);
  const saveBom = useSaveBillOfMaterials();
  const deleteBom = useDeleteBillOfMaterials();

  const usedIds = new Set(
    rows.flatMap((row) => (row.component ? [row.component.id] : [])),
  );

  function updateRow(key: string, patch: Partial<MaterialRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const items = [];
    for (const row of rows) {
      const quantity = Number(row.quantity);
      if (!row.component || !quantity || quantity <= 0) {
        setFormError(
          'Elige el material y una cantidad mayor a 0 en cada línea (o quítala).',
        );
        return;
      }
      items.push({ componentId: row.component.id, quantity });
    }
    if (items.length === 0) {
      setFormError('Agrega al menos un material.');
      return;
    }
    setFormError(null);
    saveBom.mutate({ productId: product.id, items }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="border-accent-line bg-accent-surface flex gap-3 rounded-xl border px-4 py-3">
        <Layers className="text-accent mt-0.5 h-4.5 w-4.5 shrink-0" />
        <p className="text-ink-secondary text-[13px] leading-5">
          Cantidades para <strong className="text-ink">una unidad</strong> de{' '}
          {product.name}. Al pasar un pedido de este producto a almacén, Opera
          descuenta estos materiales de la bodega y calcula su costo.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-ink-muted grid grid-cols-[minmax(0,1fr)_130px_36px] gap-2 px-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
          <span>Material</span>
          <span className="text-right">Por unidad</span>
          <span />
        </div>
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_130px_36px] items-center gap-2"
          >
            {row.component ? (
              <div className="border-line bg-chrome/60 flex h-9 items-center justify-between gap-2 rounded-lg border px-3 text-sm">
                <span className="text-ink truncate">
                  <span className="code text-ink-faint mr-1.5 text-xs">
                    {row.component.sku}
                  </span>
                  {row.component.name}
                  <span className="text-ink-faint ml-1.5 text-xs">
                    · {PRODUCT_TYPE_LABELS[row.component.type]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => updateRow(row.key, { component: null })}
                  className="text-accent hover:text-accent-hover shrink-0 text-xs font-medium"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <ProductPicker
                value={null}
                ariaLabel={`Buscar material línea ${index + 1}`}
                placeholder="Buscar materia prima o insumo…"
                filter={(candidate) =>
                  candidate.type !== 'FINISHED_GOOD' &&
                  candidate.isActive &&
                  !usedIds.has(candidate.id)
                }
                onChange={(picked) =>
                  picked &&
                  updateRow(row.key, {
                    component: {
                      id: picked.id,
                      sku: picked.sku,
                      name: picked.name,
                      type: picked.type,
                      unitAbbreviation: picked.unit.abbreviation,
                    },
                  })
                }
              />
            )}
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                aria-label={`Cantidad por unidad línea ${index + 1}`}
                value={row.quantity}
                onChange={(event) =>
                  updateRow(row.key, { quantity: event.target.value })
                }
                className="field figures h-9 w-full pr-12 pl-3 text-right"
              />
              <span className="text-ink-faint pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                {row.component?.unitAbbreviation ?? ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setRows((prev) => prev.filter((r) => r.key !== row.key))
              }
              aria-label={`Quitar línea ${index + 1}`}
              className="text-ink-muted hover:text-danger hover:bg-danger-surface focus-visible:ring-accent flex h-9 w-9 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
        >
          <Plus />
          Agregar material
        </Button>
      </div>

      <FieldError message={formError ?? undefined} />
      <FormError
        error={saveBom.error ?? deleteBom.error}
        fallback="No se pudo guardar la lista de materiales."
      />

      <div className="flex items-center justify-between gap-3">
        {hasSavedList ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleteBom.isPending}
            onClick={() => deleteBom.mutate(product.id, { onSuccess: onDone })}
          >
            <Trash2 />
            {deleteBom.isPending ? 'Quitando…' : 'Quitar lista'}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={saveBom.isPending}>
          <Save />
          {saveBom.isPending ? 'Guardando…' : 'Guardar lista de materiales'}
        </Button>
      </div>
    </form>
  );
}
