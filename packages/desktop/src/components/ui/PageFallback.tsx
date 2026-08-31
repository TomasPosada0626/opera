// Fallback de <Suspense> para las páginas cargadas con React.lazy (#21,
// auditoría) -- los chunks vienen de disco local (Electron, ver ADR 0003),
// así que esto casi nunca llega a verse; existe para no dejar una pantalla
// en blanco en un arranque en frío o un disco lento.
export function PageFallback() {
  return <p className="text-ink-muted p-8 text-sm">Cargando…</p>;
}
