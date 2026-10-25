import type { LucideIcon } from 'lucide-react';

interface TabOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps<T extends string> {
  label: string;
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

// Vistas de una misma pantalla como pestañas subrayadas (role="tablist"):
// el contenido de cada una lo renderiza la página según `value`.
export function Tabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="border-line flex gap-1 border-b"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={`focus-visible:ring-accent relative -mb-px inline-flex h-10 items-center gap-2 rounded-t-md px-3.5 text-[13.5px] font-medium transition-colors duration-200 outline-none focus-visible:ring-2 ${
              isActive
                ? 'text-ink after:bg-accent after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
