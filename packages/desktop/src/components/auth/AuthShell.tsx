import type { ReactNode } from 'react';
import { ClipboardCheck, HandCoins, ShieldCheck } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

const HIGHLIGHTS = [
  {
    icon: ClipboardCheck,
    title: 'Cada pedido, de la toma al despacho',
    text: 'En qué estación está, cuánto lleva ahí y si va a tiempo.',
  },
  {
    icon: HandCoins,
    title: 'Cobro con historial',
    text: 'Cada abono con su fecha y medio; la cartera al día.',
  },
  {
    icon: ShieldCheck,
    title: 'Números en los que se puede confiar',
    text: 'El stock sale del Kardex, que no se edita ni se borra.',
  },
];

// Marco común de login, configuración inicial y recuperación: panel de
// marca a la izquierda (solo en pantallas anchas) y el formulario a la
// derecha. Antes eran tres tarjetas flotando sobre un fondo vacío.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="bg-surface grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="border-line bg-chrome relative hidden overflow-hidden border-r lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="bg-accent/[0.16] dark:bg-accent/[0.22] pointer-events-none absolute -top-40 -left-32 h-[34rem] w-[34rem] rounded-full blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
        />
        <div className="relative flex items-center gap-3">
          <Logo size={34} />
          <span className="text-ink text-base font-medium tracking-[0.32em]">
            OPERA
          </span>
        </div>

        <div className="relative max-w-md">
          <p className="text-accent text-[11px] font-semibold tracking-[0.18em] uppercase">
            Gestión operativa
          </p>
          <h2 className="text-ink mt-3 text-[34px] leading-[1.1] font-semibold tracking-[-0.025em]">
            Pedidos, producción, inventario y cobro en un solo lugar.
          </h2>
          <ul className="mt-10 flex flex-col gap-6">
            {HIGHLIGHTS.map(({ icon: Icon, title: itemTitle, text }) => (
              <li key={itemTitle} className="flex gap-4">
                <div className="border-line-strong bg-surface-raised text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-ink text-sm font-medium">{itemTitle}</p>
                  <p className="text-ink-muted mt-0.5 text-[13px]">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-ink-faint relative text-xs">
          Funciona en tu red local, sin depender de internet.
        </p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute top-5 right-5">
          <ThemeToggle />
        </div>
        <div className="animate-pop-in w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={30} />
            <span className="text-ink text-[15px] font-medium tracking-[0.32em]">
              OPERA
            </span>
          </div>
          <h1 className="text-ink text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-ink-muted mt-2 text-sm leading-6">{subtitle}</p>
          )}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
