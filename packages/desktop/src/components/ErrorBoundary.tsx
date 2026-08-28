import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  // 'full' (default): último recurso alrededor de todo el árbol (App.tsx) —
  // ocupa la pantalla completa porque en ese punto ya no queda ningún shell
  // (sidebar/topbar) que seguir mostrando. 'inline': usado dentro de
  // AppLayout alrededor de <Outlet/> (señalado en la re-auditoría — antes
  // un solo boundary global tumbaba TODA la app, sidebar incluido, por un
  // error de render en una sola página) — se queda dentro de su
  // contenedor, así el resto del shell sigue usable para navegar a otra
  // pantalla que sí funcione.
  variant?: 'full' | 'inline';
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Antes un error de render en cualquier componente tumbaba TODA la app a
// una pantalla en blanco — React desmonta el árbol entero cuando nada lo
// atrapa (señalado en la auditoría). `initErrorLogging` (lib/error-logging
// .ts) ya capturaba errores fuera del ciclo de render (window.onerror,
// promesas sin catch); esto cubre el hueco real que quedaba: un throw
// DENTRO del render de React, que ningún listener de window ve pasar.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof window !== 'undefined' && window.appLogs) {
      void window.appLogs.reportError({
        type: 'react.componentDidCatch',
        message: error.message,
        stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`,
      });
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const isFull = (this.props.variant ?? 'full') === 'full';

    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${isFull ? 'min-h-screen' : 'py-16'}`}
      >
        <h1 className="text-ink text-2xl font-medium">Algo salió mal</h1>
        <p className="text-ink-muted max-w-md">
          {isFull
            ? 'La aplicación encontró un error inesperado y no puede continuar en esta pantalla. El error ya quedó registrado localmente.'
            : 'Esta pantalla encontró un error inesperado. El resto de la aplicación sigue funcionando — el error ya quedó registrado localmente.'}
        </p>
        <Button onClick={this.handleReload}>Recargar</Button>
      </div>
    );
  }
}
