import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  const originalAppUpdater = window.appUpdater;

  afterEach(() => {
    window.appUpdater = originalAppUpdater;
  });

  it('renders nothing outside Electron (no appUpdater bridge)', () => {
    // @ts-expect-error -- simula jsdom/navegador suelto sin el bridge.
    window.appUpdater = undefined;

    const { container } = render(<UpdateBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while no update has been downloaded', () => {
    window.appUpdater = {
      onUpdateReady: vi.fn(),
      restartAndInstall: vi.fn(),
    };

    const { container } = render(<UpdateBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the version and restarts when an update is ready', async () => {
    let readyCallback: (version: string) => void = () => {};
    const restartAndInstall = vi.fn().mockResolvedValue(undefined);
    window.appUpdater = {
      onUpdateReady: (callback) => {
        readyCallback = callback;
      },
      restartAndInstall,
    };

    render(<UpdateBanner />);
    readyCallback('1.2.0');

    expect(
      await screen.findByText(/nueva versión de Opera \(1\.2\.0\)/),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Reiniciar y actualizar' }),
    );

    expect(restartAndInstall).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: 'Reiniciando…' }),
    ).toBeDisabled();
  });
});
