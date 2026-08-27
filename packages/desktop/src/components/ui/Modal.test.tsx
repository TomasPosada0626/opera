import { useState, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function ModalWithTrigger({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const [openModal, setOpenModal] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpenModal(true)}>
        Abrir modal
      </button>
      {openModal && (
        <Modal
          title="Título"
          onClose={() => {
            setOpenModal(false);
            onClose();
          }}
        >
          {children}
        </Modal>
      )}
    </>
  );
}

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

  // El botón "Cerrar" del header precede a los children en el DOM, así que
  // siempre es el primer control focuseable del panel — el propio Modal
  // garantiza que FOCUSABLE_SELECTOR nunca matchee cero elementos.
  it('focuses the first focusable control (the close button) on open', () => {
    render(
      <Modal title="Título" onClose={vi.fn()}>
        <input aria-label="Nombre" />
        <button type="button">Guardar</button>
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('traps Tab on the last focusable element, wrapping to the close button', async () => {
    const user = userEvent.setup();
    render(
      <Modal title="Título" onClose={vi.fn()}>
        <input aria-label="Nombre" />
        <button type="button">Guardar</button>
      </Modal>,
    );

    screen.getByRole('button', { name: 'Guardar' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('traps Shift+Tab on the close button, wrapping to the last element', async () => {
    const user = userEvent.setup();
    render(
      <Modal title="Título" onClose={vi.fn()}>
        <input aria-label="Nombre" />
        <button type="button">Guardar</button>
      </Modal>,
    );

    screen.getByRole('button', { name: 'Cerrar' }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });

  it('restores focus to the element that opened it once closed', async () => {
    const user = userEvent.setup();
    render(<ModalWithTrigger onClose={vi.fn()}>Contenido</ModalWithTrigger>);

    const trigger = screen.getByRole('button', { name: 'Abrir modal' });
    await user.click(trigger);

    // El foco entra al modal al abrirse...
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();

    await user.keyboard('{Escape}');

    // ...y vuelve al disparador al desmontarse.
    expect(trigger).toHaveFocus();
  });
});
