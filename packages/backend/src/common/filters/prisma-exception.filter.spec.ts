import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function hostWith(response: { status: jest.Mock; json: jest.Mock }) {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
  });

  it('translates P2002 (unique constraint) into a 409 naming the field', () => {
    filter.catch(
      prismaError('P2002', { target: ['email'] }),
      hostWith({ status, json }),
    );

    expect(status).toHaveBeenCalledWith(409);
    const [[body]] = json.mock.calls as [
      { statusCode: number; message: string },
    ][];
    expect(body.statusCode).toBe(409);
    expect(body.message).toContain('email');
  });

  it('translates P2025 (record not found) into a 404', () => {
    filter.catch(prismaError('P2025'), hostWith({ status, json }));

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('translates P2003 (foreign key constraint) into a 409', () => {
    filter.catch(
      prismaError('P2003', { field_name: 'warehouseId' }),
      hostWith({ status, json }),
    );

    expect(status).toHaveBeenCalledWith(409);
    const [[body]] = json.mock.calls as [
      { statusCode: number; message: string },
    ][];
    expect(body.statusCode).toBe(409);
    expect(body.message).toContain('warehouseId');
  });

  it('translates P2000 (value too long) into a 400', () => {
    filter.catch(prismaError('P2000'), hostWith({ status, json }));

    expect(status).toHaveBeenCalledWith(400);
  });

  it('falls back to a logged 500 for an untranslated Prisma error code', () => {
    filter.catch(prismaError('P2034'), hostWith({ status, json }));

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });
});
