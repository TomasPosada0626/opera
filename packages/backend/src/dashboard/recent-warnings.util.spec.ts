import { existsSync, readFileSync } from 'fs';
import { countRecentWarnings } from './recent-warnings.util';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const mockedExistsSync = existsSync as jest.Mock;
const mockedReadFileSync = readFileSync as jest.Mock;

describe('countRecentWarnings', () => {
  const now = new Date('2026-08-28T12:00:00.000Z');

  beforeEach(() => {
    mockedExistsSync.mockReset();
    mockedReadFileSync.mockReset();
  });

  it('returns 0 when the log file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(countRecentWarnings(now)).toBe(0);
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });

  it('returns 0 and does not throw when reading the file fails', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('EBUSY');
    });

    expect(countRecentWarnings(now)).toBe(0);
  });

  it('counts only warn/error/fatal entries from the last 24h', () => {
    mockedExistsSync.mockReturnValue(true);
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    const twoDaysAgo = now.getTime() - 2 * 24 * 60 * 60 * 1000;
    const lines = [
      JSON.stringify({ level: 30, time: oneHourAgo, msg: 'info reciente' }),
      JSON.stringify({ level: 40, time: oneHourAgo, msg: 'warn reciente' }),
      JSON.stringify({ level: 50, time: oneHourAgo, msg: 'error reciente' }),
      JSON.stringify({ level: 60, time: oneHourAgo, msg: 'fatal reciente' }),
      JSON.stringify({ level: 40, time: twoDaysAgo, msg: 'warn viejo' }),
    ].join('\n');
    mockedReadFileSync.mockReturnValue(lines);

    expect(countRecentWarnings(now)).toBe(3);
  });

  it('ignores blank lines and lines that are not valid JSON', () => {
    mockedExistsSync.mockReturnValue(true);
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    const lines = [
      '',
      'not json at all',
      JSON.stringify({ level: 40, time: oneHourAgo }),
      '   ',
    ].join('\n');
    mockedReadFileSync.mockReturnValue(lines);

    expect(countRecentWarnings(now)).toBe(1);
  });
});
