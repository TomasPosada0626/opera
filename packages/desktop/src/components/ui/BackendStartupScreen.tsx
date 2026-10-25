import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  HardDrive,
  Loader2,
  MonitorCheck,
  RotateCw,
  Server,
} from 'lucide-react';
import { Logo } from './Logo';
import { Button } from './Button';
import { startupStep } from '../../lib/startup-step';

interface BackendStartupScreenProps {
  status: BackendStatus;
}

const STEPS = [
  { label: 'Docker Desktop', icon: HardDrive },
  { label: 'Base de datos', icon: Database },
  { label: 'Preparando los datos', icon: Server },
  { label: 'Abriendo Opera', icon: MonitorCheck },
];

// Fondo de marca compartido con AuthShell: brillo de acento y trama de
// puntos, para que el arranque y el login se sientan la misma app.
function BrandBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="bg-accent/[0.14] dark:bg-accent/[0.2] pointer-events-none absolute -top-48 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.3] [background-image:radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />
    </>
  );
}

function ErrorPanel({ message }: { message: string }) {
  const [exportNote, setExportNote] = useState<string | null>(null);

  async function exportLogs() {
    if (!window.appLogs) {
      return;
    }
    const result = await window.appLogs.export();
    if (result.ok) {
      setExportNote(`Guardado en ${result.path}`);
    } else if (result.reason === 'no-logs') {
      setExportNote('Todavía no hay errores registrados.');
    }
  }

  return (
    <div className="border-line bg-surface-raised animate-pop-in w-full max-w-[460px] rounded-2xl border p-7 text-left shadow-xl shadow-black/[0.06] dark:shadow-black/50">
      <div className="flex items-start gap-4">
        <div className="border-danger-line bg-danger-surface text-danger flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-ink text-base font-semibold tracking-tight">
            Opera no pudo arrancar
          </h1>
          <p
            role="alert"
            className="text-ink-secondary mt-1.5 text-sm leading-6"
          >
            {message}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Button onClick={() => void window.appBackend?.retry()}>
          <RotateCw />
          Reintentar
        </Button>
        {window.appLogs && (
          <Button variant="secondary" onClick={() => void exportLogs()}>
            <Download />
            Exportar registro de errores
          </Button>
        )}
      </div>
      {exportNote && (
        <p className="text-ink-muted mt-3 text-xs break-all">{exportNote}</p>
      )}
    </div>
  );
}

// Se muestra en vez del router real mientras electron/backend-manager.ts
// levanta Postgres y el backend en segundo plano -- ver App.tsx, que
// suscribe window.appBackend y solo llega a montar esto cuando el bridge
// existe (build empaquetado) y su estado todavía no es 'ready'. En dev y en
// tests el bridge no existe, así que este componente nunca se renderiza ahí.
export function BackendStartupScreen({ status }: BackendStartupScreenProps) {
  const isError = status.state === 'error';
  const message = status.message ?? 'Iniciando Opera…';
  const current = startupStep(status.message);

  return (
    <div className="bg-surface relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <BrandBackdrop />
      {!isError && (
        <div
          aria-hidden="true"
          className="bg-accent/10 absolute inset-x-0 top-0 h-[3px] overflow-hidden"
        >
          <div className="bg-accent animate-progress h-full w-2/5 rounded-full" />
        </div>
      )}

      <div className="relative flex w-full flex-col items-center">
        <Logo size={52} showWordmark />

        {isError ? (
          <div className="mt-10 flex w-full justify-center">
            <ErrorPanel
              message={status.message ?? 'No se pudo iniciar Opera.'}
            />
          </div>
        ) : (
          <div className="animate-fade-in mt-10 flex w-full max-w-[360px] flex-col items-center">
            {current !== null && (
              <ol className="flex w-full flex-col gap-1" aria-label="Arranque">
                {STEPS.map(({ label, icon: Icon }, index) => {
                  const done = index < current;
                  const active = index === current;
                  return (
                    <li
                      key={label}
                      aria-current={active ? 'step' : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-300 ${
                        active
                          ? 'bg-surface-raised border-line border shadow-sm'
                          : 'border border-transparent'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                          done
                            ? 'border-success-line bg-success-surface text-success'
                            : active
                              ? 'border-accent-line bg-accent-surface text-accent'
                              : 'border-line text-ink-faint'
                        }`}
                      >
                        {done ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : active ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Icon className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span
                        className={`text-sm ${
                          active
                            ? 'text-ink font-medium'
                            : done
                              ? 'text-ink-secondary'
                              : 'text-ink-faint'
                        }`}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <p
              role="status"
              className="text-ink-muted mt-5 min-h-10 text-center text-[13px] leading-5"
            >
              {message}
            </p>
          </div>
        )}
      </div>

      <p className="text-ink-faint absolute bottom-6 text-xs">
        Tus datos se guardan en esta PC.
      </p>
    </div>
  );
}
