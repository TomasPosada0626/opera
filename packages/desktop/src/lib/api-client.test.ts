import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiFetchBlob } from './api-client';
import { getAuthToken } from './auth-token';

vi.mock('./auth-token', () => ({
  getAuthToken: vi.fn(),
}));

const mockedGetAuthToken = vi.mocked(getAuthToken);

function jsonResponse(
  body: unknown,
  init: { status?: number; statusText?: string } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api-client', () => {
  beforeEach(() => {
    mockedGetAuthToken.mockReset();
    mockedGetAuthToken.mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('apiFetch', () => {
    it('sends no Authorization header when there is no token', async () => {
      mockedGetAuthToken.mockReturnValue(null);
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

      await apiFetch('/products');

      const [, options] = vi.mocked(fetch).mock.calls[0];
      const headers = options?.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('sends a Bearer Authorization header when a token is present', async () => {
      mockedGetAuthToken.mockReturnValue('jwt-token');
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

      await apiFetch('/products');

      const [, options] = vi.mocked(fetch).mock.calls[0];
      const headers = options?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer jwt-token');
    });

    it('returns the parsed JSON body on success', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: '1', name: 'x' }));

      const result = await apiFetch<{ id: string; name: string }>(
        '/products/1',
      );

      expect(result).toEqual({ id: '1', name: 'x' });
    });

    it('returns undefined for a 204 No Content response without parsing the body', async () => {
      const response = new Response(null, { status: 204 });
      const jsonSpy = vi.spyOn(response, 'json');
      vi.mocked(fetch).mockResolvedValue(response);

      const result = await apiFetch('/products/1/deactivate');

      expect(result).toBeUndefined();
      expect(jsonSpy).not.toHaveBeenCalled();
    });

    it('throws an ApiError with the joined validation messages on a 400 array body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          { statusCode: 400, message: ['name is required', 'sku is required'] },
          { status: 400 },
        ),
      );

      await expect(apiFetch('/products')).rejects.toMatchObject({
        name: 'ApiError',
        statusCode: 400,
        message: 'name is required, sku is required',
      });
    });

    it('throws an ApiError with the single string message on error', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          { statusCode: 404, message: 'Not found' },
          { status: 404 },
        ),
      );

      await expect(apiFetch('/products/missing')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Not found',
      });
    });

    it('falls back to statusText when the error body is not valid JSON', async () => {
      const response = new Response('not json', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.mocked(fetch).mockResolvedValue(response);

      await expect(apiFetch('/products')).rejects.toMatchObject({
        statusCode: 500,
        message: 'Internal Server Error',
      });
    });

    it('merges caller-provided headers with the default headers', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

      await apiFetch('/products', { headers: { 'X-Custom': 'value' } });

      const [, options] = vi.mocked(fetch).mock.calls[0];
      const headers = options?.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('value');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('apiFetchBlob', () => {
    it('returns the response body as a Blob on success', async () => {
      const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      const response = new Response(blob, { status: 200 });
      vi.mocked(fetch).mockResolvedValue(response);

      const result = await apiFetchBlob('/remissions/1/pdf');

      expect(result).toBeInstanceOf(Blob);
    });

    it('throws an ApiError on failure instead of returning a blob', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          { statusCode: 403, message: 'Forbidden' },
          { status: 403 },
        ),
      );

      await expect(apiFetchBlob('/remissions/1/pdf')).rejects.toBeInstanceOf(
        ApiError,
      );
    });
  });
});
