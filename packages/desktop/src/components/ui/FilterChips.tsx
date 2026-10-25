interface FilterChip<T> {
  value: T;
  label: string;
  // Conteo opcional al lado de la etiqueta ("Atrasados 3").
  count?: number;
}

interface FilterChipsProps<T> {
  label: string;
  options: FilterChip<T>[];
  value: T;
  onChange: (value: T) => void;
}

// Filtros rápidos de un listado en forma de segmentos — la opción activa
// lleva el acento, el resto queda neutral. aria-pressed para que un lector
// de pantalla anuncie cuál está aplicado.
export function FilterChips<T>({
  label,
  options,
  value,
  onChange,
}: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`focus-visible:ring-accent ease-snappy inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-200 outline-none focus-visible:ring-2 active:scale-[0.97] ${
              isActive
                ? 'border-accent bg-accent text-on-accent shadow-accent/25 shadow-sm'
                : 'border-line-strong bg-surface-raised text-ink-muted hover:text-ink hover:border-ink-faint/60'
            }`}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span
                className={`figures rounded-full px-1.5 text-[11px] ${
                  isActive ? 'bg-white/20' : 'bg-chrome-strong text-ink'
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
