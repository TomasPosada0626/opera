import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from './current-user';
import { getAuthToken } from './auth-token';

vi.mock('./auth-token', () => ({
  getAuthToken: vi.fn(),
}));

const mockedGetAuthToken = vi.mocked(getAuthToken);

function buildJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('getCurrentUser', () => {
  beforeEach(() => {
    mockedGetAuthToken.mockReset();
  });

  it('returns null when there is no token', () => {
    mockedGetAuthToken.mockReturnValue(null);

    expect(getCurrentUser()).toBeNull();
  });

  it('decodes the JWT payload when a valid token is present', () => {
    const payload = {
      sub: 'user-1',
      email: 'admin@opera.local',
      roles: ['ADMIN'],
      permissions: [],
    };
    mockedGetAuthToken.mockReturnValue(buildJwt(payload));

    expect(getCurrentUser()).toEqual(payload);
  });

  it('returns null when the token has no payload segment', () => {
    mockedGetAuthToken.mockReturnValue('only-one-segment');

    expect(getCurrentUser()).toBeNull();
  });

  it('returns null when the payload segment is not valid base64/JSON', () => {
    mockedGetAuthToken.mockReturnValue('header.not-valid-base64!!!.signature');

    expect(getCurrentUser()).toBeNull();
  });
});
