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
    queries: { retry: shouldRetry },
    mutations: { retry: false },
  },
});
