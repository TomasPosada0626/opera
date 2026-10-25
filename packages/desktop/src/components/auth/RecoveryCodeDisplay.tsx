import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

interface RecoveryCodeDisplayProps {
  code: string;
}

// El código se muestra una sola vez (después solo queda su hash): grande,
// en mono, con botón de copiar y la advertencia de por qué importa. Lo
// usan la configuración inicial, el menú de usuario y la recuperación.
export function RecoveryCodeDisplay({ code }: RecoveryCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Sin permiso de portapapeles: el código igual está a la vista.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-accent-line bg-accent-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-4">
        <div className="flex items-center gap-3">
          <KeyRound className="text-accent h-5 w-5 shrink-0" />
          <span
            data-testid="recovery-code"
            className="figures text-ink text-xl font-semibold tracking-[0.12em] select-all"
          >
            {code}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="border-line-strong bg-surface-raised text-ink-secondary hover:text-ink focus-visible:ring-accent inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-all duration-200 outline-none focus-visible:ring-2 active:scale-[0.97]"
        >
          {copied ? (
            <Check className="text-success h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-ink-muted text-[13px] leading-5">
        Anótalo en papel y guárdalo en un lugar seguro, fuera del computador. Si
        olvidas la contraseña y no hay correo configurado, es la única forma de
        volver a entrar. No se vuelve a mostrar.
      </p>
    </div>
  );
}
