import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Category, PaginatedResult } from '../types/product';

interface UseCategoriesParams {
  page: number;
  pageSize: number;
  search?: string;
}

export function useCategories({ page, pageSize, search }: UseCategoriesParams) {
  return useQuery({
    queryKey: ['categories', { page, pageSize, search }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) {
        params.set('search', search);
      }
      return apiFetch<PaginatedResult<Category>>(
        `/categories?${params.toString()}`,
      );
    },
    placeholderData: (previousData) => previousData,
  });
}
