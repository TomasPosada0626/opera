import { useTheme } from '../../lib/theme';

// Switch de tema (#85): sol/luna en vez de un círculo vacío — el propósito
// debe leerse de un vistazo, no solo intuirse por la posición.
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={toggleTheme}
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-line bg-surface-raised transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span
        aria-hidden="true"
        className={`absolute left-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent transition-transform duration-200 ${
          isDark ? 'translate-x-6' : 'translate-x-0'
        }`}
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M21.64 13a1 1 0 0 0-1.05-.14 8.05 8.05 0 0 1-3.37.73 8.15 8.15 0 0 1-8.14-8.1 8.59 8.59 0 0 1 .25-2A1 1 0 0 0 8 2.36a10.14 10.14 0 1 0 13.36 13.37 1 1 0 0 0 .28-2.73Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M12 4a1 1 0 0 1-1-1V1a1 1 0 0 1 2 0v2a1 1 0 0 1-1 1Zm0 16a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1ZM4 12a1 1 0 0 1-1 1H1a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1Zm20 0a1 1 0 0 1-1 1h-2a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1ZM5.64 5.64a1 1 0 0 1-1.41 0L2.81 4.22a1 1 0 1 1 1.41-1.41l1.42 1.41a1 1 0 0 1 0 1.42Zm14.14 14.14a1 1 0 0 1-1.41 0l-1.42-1.42a1 1 0 0 1 1.41-1.41l1.42 1.42a1 1 0 0 1 0 1.41ZM5.64 18.36a1 1 0 0 1 0 1.41L4.22 21.2a1 1 0 1 1-1.41-1.41l1.41-1.42a1 1 0 0 1 1.42 0Zm14.14-14.14a1 1 0 0 1 0 1.41l-1.42 1.42a1 1 0 1 1-1.41-1.41l1.42-1.42a1 1 0 0 1 1.41 0ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" />
          </svg>
        )}
      </span>
    </button>
  );
}
