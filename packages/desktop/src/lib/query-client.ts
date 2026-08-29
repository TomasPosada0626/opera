import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

// No reintentar 401/403/404 — un token inválido o un recurso inexistente no
// se arregla reintentando la misma request.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && [401, 403, 404].includes(error.statusCode)) {
    return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
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
