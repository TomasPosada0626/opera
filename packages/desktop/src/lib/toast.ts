import { useSyncExternalStore } from 'react';

export type ToastVariant = 'success' | 'danger' | 'warning';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

const DURATION_MS = 4000;

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function dismissToast(id: string): void {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

function pushToast(variant: ToastVariant, message: string): void {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, variant, message }];
  emit();
  setTimeout(() => dismissToast(id), DURATION_MS);
}

// Singleton fuera de React (no Context) a propósito: dispara desde
// query-client.ts (mutationCache.onSuccess), que corre fuera del árbol de
// componentes — mismo motivo que queryClient ya es un singleton en ese
// archivo.
export const toast = {
  success: (message: string) => pushToast('success', message),
  danger: (message: string) => pushToast('danger', message),
  warning: (message: string) => pushToast('warning', message),
  dismiss: dismissToast,
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
