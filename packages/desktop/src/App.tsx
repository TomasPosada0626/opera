import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router';
import { router } from './router';
import { queryClient } from './lib/query-client';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { ToastContainer } from './components/ui/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackendStartupScreen } from './components/ui/BackendStartupScreen';

function App() {
  // window.appBackend solo existe en el build empaquetado (electron/
  // backend-manager.ts) -- en dev y en tests arranca directo en 'ready',
  // igual que el resto de los puentes opcionales de este proyecto (ver
  // UpdateBanner). Una sola suscripción acá, no una por componente: tanto
  // BackendStartupScreen como el resto del árbol dependen del mismo estado.
  const [status, setStatus] = useState<BackendStatus>(
    window.appBackend ? { state: 'starting' } : { state: 'ready' },
  );

  useEffect(() => {
    if (!window.appBackend) {
      return;
    }
    void window.appBackend.getStatus().then(setStatus);
    window.appBackend.onStatusChange(setStatus);
  }, []);

  if (status.state !== 'ready') {
    return <BackendStartupScreen status={status} />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <UpdateBanner />
        <ToastContainer />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
