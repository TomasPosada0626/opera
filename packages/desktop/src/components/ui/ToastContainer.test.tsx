import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastContainer } from './ToastContainer';
import { toast, useToasts } from '../../lib/toast';

// El store de toast.ts es un singleton a nivel de módulo (a propósito, ver
// su comentario) — sin este drenado, un toast que un test deja vivo
// contamina el render del siguiente (dos botones "Cerrar notificación",
// por ejemplo, rompe getByRole).
afterEach(() => {
  const { result } = renderHook(() => useToasts());
  for (const item of result.current) {
    act(() => {
      toast.dismiss(item.id);
    });
  }
});

describe('ToastContainer', () => {
  it('renders nothing when there are no toasts', () => {
    render(<ToastContainer />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a success toast with its message', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('Producto creado.');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Producto creado.');
  });

  it('dismisses a toast when its close button is clicked', async () => {
    const user = userEvent.setup();
    render(<ToastContainer />);
    act(() => {
      toast.warning('Cuidado.');
    });
    expect(screen.getByText('Cuidado.')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Cerrar notificación' }),
    );

    expect(screen.queryByText('Cuidado.')).not.toBeInTheDocument();
  });

  it('stacks multiple toasts at once', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('Primero');
      toast.danger('Segundo');
    });

    expect(screen.getByText('Primero')).toBeInTheDocument();
    expect(screen.getByText('Segundo')).toBeInTheDocument();
  });
});
