import { paginate, resolveOrderBy } from './paginate';

describe('paginate', () => {
  it('computes skip/take from page and pageSize and returns data with meta', async () => {
    const countFn = jest.fn().mockResolvedValue(45);
    const findFn = jest.fn().mockResolvedValue(['a', 'b']);

    const result = await paginate(countFn, findFn, 3, 20);

    expect(findFn).toHaveBeenCalledWith({ skip: 40, take: 20 });
    expect(result).toEqual({
      data: ['a', 'b'],
      meta: { page: 3, pageSize: 20, total: 45, totalPages: 3 },
    });
  });

  it('rounds totalPages up when total is not an exact multiple of pageSize', async () => {
    const countFn = jest.fn().mockResolvedValue(41);
    const findFn = jest.fn().mockResolvedValue([]);

    const result = await paginate(countFn, findFn, 1, 20);

    expect(result.meta.totalPages).toBe(3);
  });

  it('returns zero pages when there are no results', async () => {
    const countFn = jest.fn().mockResolvedValue(0);
    const findFn = jest.fn().mockResolvedValue([]);

    const result = await paginate(countFn, findFn, 1, 20);

    expect(result.meta.totalPages).toBe(0);
  });
});

describe('resolveOrderBy', () => {
  const allowedFields = ['name', 'createdAt'] as const;

  it('uses sortBy when it is an allowed field', () => {
    expect(resolveOrderBy('createdAt', 'desc', allowedFields, 'name')).toEqual({
      createdAt: 'desc',
    });
  });

  it('falls back to the fallback field when sortBy is not allowed', () => {
    expect(resolveOrderBy('location', 'asc', allowedFields, 'name')).toEqual({
      name: 'asc',
    });
  });

  it('falls back to the fallback field when sortBy is undefined', () => {
    expect(resolveOrderBy(undefined, 'asc', allowedFields, 'name')).toEqual({
      name: 'asc',
    });
  });
});
