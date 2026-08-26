import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from './AppLayout';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles,
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function renderAt(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div>Dashboard content</div>} />
            <Route path="/productos" element={<div>Products content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppLayout sidebar', () => {
  beforeEach(() => {
    setAuthToken(fakeJwt(['ADMIN']));
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('starts with the Catálogo group collapsed, hiding its children', () => {
    renderAt('/');

    expect(screen.getByRole('button', { name: /Catálogo/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      screen.queryByRole('link', { name: /Productos/ }),
    ).not.toBeInTheDocument();
  });

  it('expands the group on click, revealing its children', () => {
    renderAt('/');

    fireEvent.click(screen.getByRole('button', { name: /Catálogo/ }));

    expect(screen.getByRole('button', { name: /Catálogo/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: /Productos/ })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Categorías/ }),
    ).toBeInTheDocument();
  });

  it('starts expanded when the current route is one of its children', () => {
    renderAt('/productos');

    expect(screen.getByRole('button', { name: /Catálogo/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: /Productos/ })).toBeInTheDocument();
  });
});
