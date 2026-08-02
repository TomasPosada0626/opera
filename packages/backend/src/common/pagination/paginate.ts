export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export async function paginate<T>(
  countFn: () => Promise<number>,
  findFn: (args: { skip: number; take: number }) => Promise<T[]>,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<T>> {
  const skip = (page - 1) * pageSize;
  const [total, data] = await Promise.all([
    countFn(),
    findFn({ skip, take: pageSize }),
  ]);

  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// Cada entidad define sus propios campos ordenables (no todos los campos de
// la tabla deben ser un sortBy válido) y un campo de respaldo si sortBy no
// está en esa lista o no vino en la query.
export function resolveOrderBy<T extends string>(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc',
  allowedFields: readonly T[],
  fallbackField: T,
): Record<string, 'asc' | 'desc'> {
  const field = allowedFields.includes(sortBy as T)
    ? (sortBy as T)
    : fallbackField;

  return { [field]: sortOrder };
}
