import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'opera.theme';

function readStoredTheme(): Theme | null {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

// Preferencia guardada explícitamente > preferencia del sistema — el
// usuario solo "recuerda" una elección si de verdad la hizo con el switch.
function getPreferredTheme(): Theme {
  return readStoredTheme() ?? getSystemTheme();
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Se llama en main.tsx, antes de montar React — aplicar el tema después del
// primer render causaría un parpadeo visible del tema equivocado.
export function initTheme(): void {
  applyTheme(getPreferredTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getPreferredTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, toggleTheme };
}
