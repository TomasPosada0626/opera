import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserMenu } from './UserMenu';
import type { CurrentUser } from '../../lib/current-user';

function buildUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles: ['ADMIN'],
    permissions: [],
    ...overrides,
  };
}

describe('UserMenu', () => {
  it('renders nothing when there is no user', () => {
    const { container } = render(<UserMenu user={null} onLogout={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the user initials and keeps the menu closed by default', () => {
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'AD' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu on click, showing the email and roles', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('admin@opera.local')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('shows a placeholder when the user has no roles', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser({ roles: [] })} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));

    expect(screen.getByText('Sin rol asignado')).toBeInTheDocument();
  });

  it('closes the menu on a second click of the trigger', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'AD' });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu when clicking outside of it', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <UserMenu user={buildUser()} onLogout={vi.fn()} />
        <button type="button">Fuera</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'AD' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fuera' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onLogout when "Cerrar sesión" is clicked', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<UserMenu user={buildUser()} onLogout={onLogout} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));
    await user.click(screen.getByRole('menuitem', { name: /Cerrar sesión/ }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
