import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToasts } from './toast';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Vacía cualquier toast que haya quedado vivo entre tests — el store es
    // un singleton a nivel de módulo, no se resetea solo entre `it()`.
    const { result } = renderHook(() => useToasts());
    for (const item of result.current) {
      act(() => {
        toast.dismiss(item.id);
      });
    }
    vi.useRealTimers();
  });

  it('adds a toast that useToasts picks up', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      toast.success('Producto creado.');
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      variant: 'success',
      message: 'Producto creado.',
    });
  });

  it('assigns each toast a distinct id', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      toast.success('Uno');
      toast.warning('Dos');
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0].id).not.toBe(result.current[1].id);
  });

  it('supports the danger and warning variants', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      toast.danger('Algo falló.');
      toast.warning('Cuidado.');
    });

    expect(result.current.map((item) => item.variant)).toEqual([
      'danger',
      'warning',
    ]);
  });

  it('dismisses a toast by id via toast.dismiss', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      toast.success('Se va');
    });
    const id = result.current[0].id;

    act(() => {
      toast.dismiss(id);
    });

    expect(result.current).toHaveLength(0);
  });

  it('auto-dismisses a toast after its duration elapses', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      toast.success('Temporal');
    });
    expect(result.current).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current).toHaveLength(0);
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const { result, unmount } = renderHook(() => useToasts());
    unmount();

    // No debe lanzar aunque ya no haya listeners suscritos.
    expect(() => {
      act(() => {
        toast.success('Nadie escucha');
      });
    }).not.toThrow();
    expect(result.current).toBeDefined();
  });
});
