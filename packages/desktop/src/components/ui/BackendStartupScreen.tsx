import { Logo } from './Logo';
import { Button } from './Button';

interface BackendStartupScreenProps {
  status: BackendStatus;
}

// Se muestra en vez del router real mientras electron/backend-manager.ts
// levanta Postgres y el backend en segundo plano -- ver App.tsx, que
// suscribe window.appBackend y solo llega a montar esto cuando el bridge
// existe (build empaquetado) y su estado todavía no es 'ready'. En dev y en
// tests el bridge no existe, así que este componente nunca se renderiza ahí.
export function BackendStartupScreen({ status }: BackendStartupScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={48} showWordmark />
      {status.state === 'error' ? (
        <>
          <p role="alert" className="text-danger text-sm">
            {status.message ?? 'No se pudo iniciar Opera.'}
          </p>
          <Button onClick={() => void window.appBackend?.retry()}>
            Reintentar
          </Button>
        </>
      ) : (
        <p className="text-ink-muted text-sm">
          {status.message ?? 'Iniciando Opera…'}
        </p>
      )}
    </div>
  );
}
