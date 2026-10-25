// El AuditLog guarda códigos técnicos (entity: 'Remission', action:
// 'ADD_PAYMENT'); estas tablas los traducen a lo que la dueña reconoce.
// Un código nuevo que todavía no esté acá se muestra tal cual, nunca
// rompe la pantalla.
export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  Order: 'Pedido',
  Remission: 'Remisión',
  Product: 'Producto',
  Category: 'Categoría',
  Unit: 'Unidad',
  Warehouse: 'Bodega',
  Customer: 'Cliente',
  Supplier: 'Proveedor',
  SupplierProduct: 'Precio de proveedor',
  SupplierPurchase: 'Compra',
  StockMovement: 'Movimiento de inventario',
  ProductionOrder: 'Orden de producción',
  BillOfMaterials: 'Lista de materiales',
  User: 'Usuario',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: 'creó',
  UPDATE: 'editó',
  DELETE: 'eliminó',
  DEACTIVATE: 'desactivó',
  REACTIVATE: 'reactivó',
  ANONYMIZE: 'anonimizó',
  MARK_PRODUCTION: 'pasó a producción',
  MARK_WAREHOUSED: 'pasó a almacén',
  CANCEL: 'canceló',
  COMPLETE: 'completó',
  VOID: 'anuló',
  ADD_PAYMENT: 'registró un abono en',
  VOID_PAYMENT: 'anuló un abono de',
  RECEIVE: 'recibió',
  PASSWORD_RESET: 'restableció la contraseña de',
  PASSWORD_RESET_SELF_SERVICE: 'recuperó su contraseña',
  ENTRADA: 'registró una entrada de',
  SALIDA: 'registró una salida de',
  AJUSTE: 'ajustó el stock de',
};

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABEL[entity] ?? entity;
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action.toLowerCase();
}
