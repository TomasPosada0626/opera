import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTheme, useTheme } from './theme';

const THEME_KEY = 'opera.theme';

function stubSystemTheme(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: prefersDark,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubSystemTheme(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initTheme', () => {
    it('applies the system theme when nothing is stored', () => {
      stubSystemTheme(true);

      initTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('applies the light system theme when the system prefers light', () => {
      stubSystemTheme(false);

      initTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('prefers a stored theme over the system theme', () => {
      localStorage.setItem(THEME_KEY, 'dark');
      stubSystemTheme(false);

      initTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('ignores a corrupted stored value and falls back to the system theme', () => {
      localStorage.setItem(THEME_KEY, 'not-a-theme');
      stubSystemTheme(true);

      initTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('useTheme', () => {
    it('starts with the preferred theme', () => {
      localStorage.setItem(THEME_KEY, 'dark');

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');
    });

    it('toggleTheme flips from light to dark, persists it, and applies the class', () => {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
      expect(localStorage.getItem(THEME_KEY)).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('toggleTheme flips from dark back to light', () => {
      localStorage.setItem(THEME_KEY, 'dark');
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
      expect(localStorage.getItem(THEME_KEY)).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});
