import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';
import { toast } from './toast';

// Amplía el `meta` tipado de TanStack Query (#12) — así cada hook de
// mutación declara su propio mensaje de éxito sin que el `onSuccess` global
// de abajo necesite conocer cada dominio.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      successMessage?: string;
    };
  }
}

// No reintentar 401/403/404 — un token inválido o un recurso inexistente no
// se arregla reintentando la misma request.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && [401, 403, 404].includes(error.statusCode)) {
    return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  // Un solo punto de enganche para el toast de éxito (#12, auditoría) en vez
  // de repetir `onSuccess: () => toast.success(...)` en cada uno de los ~40
  // hooks de mutación — cada hook solo declara `meta.successMessage`, y este
  // observador global (nunca ve al usuario si el hook no lo declaró) lo
  // muestra. Errores no se centralizan acá: ya se muestran inline junto al
  // formulario/acción que falló (ConfirmModal, mensajes de campo), que tiene
  // más contexto que un toast genérico.
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const message = mutation.meta?.successMessage;
      if (message) {
        toast.success(message);
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      // Default de TanStack Query es 0 (siempre "stale"): cada refoco de
      // ventana re-disparaba TODAS las queries montadas, dashboard incluido
      // (señalado en la auditoría 2026-08-28). 60s alcanza para evitar ese
      // re-fetch constante en una app de escritorio LAN de un solo usuario
      // por sesión, sin sentirse desactualizado — cualquier mutación sigue
      // invalidando su query al instante vía queryClient.
      staleTime: 60_000,
    },
    mutations: { retry: false },
  },
});
