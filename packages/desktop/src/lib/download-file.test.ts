import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from './download-file';
import { apiFetchBlob } from './api-client';

vi.mock('./api-client', () => ({
  apiFetchBlob: vi.fn(),
}));

const mockedApiFetchBlob = vi.mocked(apiFetchBlob);

describe('downloadFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedApiFetchBlob.mockReset();
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
  });

  it('fetches the blob via apiFetchBlob (same auth as the rest of the app)', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockedApiFetchBlob.mockResolvedValue(blob);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    await downloadFile('/remissions/1/pdf', 'remision-1.pdf');

    expect(mockedApiFetchBlob).toHaveBeenCalledWith('/remissions/1/pdf');

    clickSpy.mockRestore();
  });

  it('creates an object URL, clicks a programmatic <a download>, and revokes the URL', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockedApiFetchBlob.mockResolvedValue(blob);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    await downloadFile('/remissions/1/pdf', 'remision-1.pdf');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
  });

  it('sets the anchor href and download filename before clicking', async () => {
    mockedApiFetchBlob.mockResolvedValue(new Blob(['x']));
    let capturedLink: HTMLAnchorElement | undefined;
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation(((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          capturedLink = el as HTMLAnchorElement;
          vi.spyOn(el, 'click').mockImplementation(() => {});
        }
        return el;
      }) as typeof document.createElement);

    await downloadFile('/remissions/1/pdf', 'remision-1.pdf');

    expect(capturedLink?.download).toBe('remision-1.pdf');
    expect(capturedLink?.href).toBe('blob:mock-url');

    createElementSpy.mockRestore();
  });

  it('propagates errors from apiFetchBlob without creating an object URL', async () => {
    mockedApiFetchBlob.mockRejectedValue(new Error('403 Forbidden'));

    await expect(
      downloadFile('/remissions/1/pdf', 'remision-1.pdf'),
    ).rejects.toThrow('403 Forbidden');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
