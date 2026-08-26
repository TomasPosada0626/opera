import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { GlobalSearchResult } from '../types/search';

// Habilitado solo con >= 2 caracteres — un solo carácter coincide con
// demasiado como para ser útil y dispara una request por cada tecla desde
// el primer toque.
export function useGlobalSearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      apiFetch<GlobalSearchResult>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });
}
