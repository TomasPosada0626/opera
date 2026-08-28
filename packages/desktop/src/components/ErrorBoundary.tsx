import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
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

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-ink text-2xl font-medium">Algo salió mal</h1>
        <p className="text-ink-muted max-w-md">
          La aplicación encontró un error inesperado y no puede continuar en
          esta pantalla. El error ya quedó registrado localmente.
        </p>
        <Button onClick={this.handleReload}>Recargar</Button>
      </div>
    );
  }
}
