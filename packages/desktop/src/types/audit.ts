// Una fila del AuditLog (GET /audit) — before/after son el estado completo
// de la entidad antes y después de la acción, tal cual lo guardó el
// backend (JSON libre por entidad).
export interface AuditEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  timestamp: string;
  user: { id: string; name: string };
}
