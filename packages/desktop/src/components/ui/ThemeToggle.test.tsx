import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders as light mode by default and offers to switch to dark', () => {
    render(<ThemeToggle />);

    const toggle = screen.getByRole('switch', {
      name: 'Cambiar a modo oscuro',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('switches to dark mode on click, applying the class and persisting it', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole('switch', { name: 'Cambiar a modo oscuro' }),
    );

    expect(
      screen.getByRole('switch', { name: 'Cambiar a modo claro' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('opera.theme')).toBe('dark');
  });

  it('switches back to light mode on a second click', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toggle = screen.getByRole('switch', {
      name: 'Cambiar a modo oscuro',
    });
    await user.click(toggle);
    await user.click(
      screen.getByRole('switch', { name: 'Cambiar a modo claro' }),
    );

    expect(
      screen.getByRole('switch', { name: 'Cambiar a modo oscuro' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('opera.theme')).toBe('light');
  });

  it('reads a previously stored dark preference on mount', () => {
    localStorage.setItem('opera.theme', 'dark');

    render(<ThemeToggle />);

    expect(
      screen.getByRole('switch', { name: 'Cambiar a modo claro' }),
    ).toHaveAttribute('aria-checked', 'true');
  });
});
