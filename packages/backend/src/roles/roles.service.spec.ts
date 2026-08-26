import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService', () => {
  it('lists roles ordered by name, id and name only', async () => {
    const prisma = { role: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new RolesService(prisma as unknown as PrismaService);

    await service.findAll();

    expect(prisma.role.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });
});
