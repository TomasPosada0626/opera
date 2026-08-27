import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from './Button';

// `window.appUpdater` no existe fuera de Electron empaquetado (ni en dev,
// ver electron/main.ts — el updater solo se inicializa fuera de
// VITE_DEV_SERVER_URL; ni en jsdom/tests) — mismo patrón opcional-bridge
// que ya usan auth-token.ts y error-logging.ts.
export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    window.appUpdater?.onUpdateReady((newVersion) => setVersion(newVersion));
  }, []);

  if (!version) {
    return null;
  }

  return (
    <div className="border-line bg-surface-raised fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-4 border-t px-4 py-3 shadow-lg">
      <p className="text-ink text-sm">
        Hay una nueva versión de Opera ({version}) lista para instalar.
      </p>
      <Button
        onClick={() => {
          setRestarting(true);
          void window.appUpdater.restartAndInstall();
        }}
        disabled={restarting}
      >
        <Download className="h-4 w-4" />
        {restarting ? 'Reiniciando…' : 'Reiniciar y actualizar'}
      </Button>
    </div>
  );
}
