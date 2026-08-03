import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders the title and children', () => {
    render(
      <Modal title="Título" onClose={vi.fn()}>
        <p>Contenido</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Título' })).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Título" onClose={onClose}>
        <p>Contenido</p>
      </Modal>,
    );

    // El backdrop es el contenedor fixed, hermano del <dialog>.
    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the panel itself is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Título" onClose={onClose}>
        <p>Contenido</p>
      </Modal>,
    );

    await user.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Título" onClose={onClose}>
        <p>Contenido</p>
      </Modal>,
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Título" onClose={onClose}>
        <p>Contenido</p>
      </Modal>,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
