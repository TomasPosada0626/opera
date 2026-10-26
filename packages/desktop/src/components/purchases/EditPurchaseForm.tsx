import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { FieldLabel, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useUpdatePurchaseOrder } from '../../hooks/usePurchaseOrderMutations';
import type { PurchaseOrder } from '../../types/purchase-order';

interface EditPurchaseFormProps {
  order: PurchaseOrder;
  onSuccess: () => void;
}

// Solo los datos de seguimiento: las líneas y los costos no se editan una
// vez registrada la compra (las recepciones ya escritas dependen de ellos).
export function EditPurchaseForm({ order, onSuccess }: EditPurchaseFormProps) {
  const [expectedDate, setExpectedDate] = useState(
    order.expectedDate ? order.expectedDate.slice(0, 10) : '',
  );
  const [supplierInvoice, setSupplierInvoice] = useState(
    order.supplierInvoice ?? '',
  );
  const [notes, setNotes] = useState(order.notes ?? '');
  const update = useUpdatePurchaseOrder();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      {
        id: order.id,
        expectedDate: expectedDate || null,
        supplierInvoice: supplierInvoice.trim() || null,
        notes: notes.trim() || null,
      },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="editExpectedDate">Fecha esperada</FieldLabel>
        <input
          id="editExpectedDate"
          type="date"
          value={expectedDate}
          onChange={(event) => setExpectedDate(event.target.value)}
          className="field h-9 px-3"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="editSupplierInvoice">
          Factura del proveedor
        </FieldLabel>
        <input
          id="editSupplierInvoice"
          type="text"
          maxLength={100}
          value={supplierInvoice}
          onChange={(event) => setSupplierInvoice(event.target.value)}
          className="field h-9 px-3"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="editPurchaseNotes">Notas</FieldLabel>
        <textarea
          id="editPurchaseNotes"
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="field px-3 py-2"
        />
      </div>
      <FormError
        error={update.error}
        fallback="No se pudieron guardar los cambios. Intenta de nuevo."
      />
      <Button type="submit" disabled={update.isPending}>
        <Save />
        {update.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  );
}
