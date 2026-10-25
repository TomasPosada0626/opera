import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { ApiError, type ApiShortage } from '../../lib/api-client';
import { formatQuantity } from '../../lib/format';

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  // Texto tenue a la derecha de la etiqueta ("opcional", "en kg").
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-ink-secondary flex items-baseline justify-between gap-2 text-[13px] font-medium"
    >
      {children}
      {hint && (
        <span className="text-ink-faint text-xs font-normal">{hint}</span>
      )}
    </label>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} role="alert" className="text-danger text-xs">
      {message}
    </p>
  );
}

// Lista de faltantes que el backend adjunta a un 400 de stock (qué
// producto/material, cuánto se necesita y cuánto hay) — para que la
// respuesta a "¿por qué no me deja?" esté en pantalla, no en el log.
function ShortageList({ shortages }: { shortages: ApiShortage[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {shortages.map((shortage) => (
        <li
          key={shortage.productName ?? shortage.componentName}
          className="flex items-center justify-between gap-4 text-[13px]"
        >
          <span>{shortage.componentName ?? shortage.productName}</span>
          <span className="figures text-xs">
            necesita {formatQuantity(shortage.required)} · hay{' '}
            {formatQuantity(shortage.available)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Error de una mutación: el mensaje del backend si lo hay (ya viene en
// español y explica el porqué), si no un mensaje genérico de respaldo.
export function FormError({
  error,
  fallback,
}: {
  error: unknown;
  fallback: string;
}) {
  if (!error) {
    return null;
  }
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div
      role="alert"
      className="border-danger-line bg-danger-surface text-danger animate-fade-in rounded-lg border px-3.5 py-2.5 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{apiError?.message ?? fallback}</span>
      </div>
      {apiError && apiError.shortages.length > 0 && (
        <ShortageList shortages={apiError.shortages} />
      )}
    </div>
  );
}
