import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

interface TextFieldProps {
  label: string;
  type?: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
}

// Building block compartido para "validación de formularios consistente en
// toda la app" (#39): un solo lugar que decide cómo se ve un campo, su
// etiqueta y su mensaje de error — el login (#40) y los formularios de
// movimiento de inventario (#43) lo reutilizan en vez de repetir el mismo
// marcado con estilos ligeramente distintos cada vez.
export function TextField({
  label,
  type = 'text',
  registration,
  error,
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={registration.name}
        className="text-ink-muted text-sm font-medium"
      >
        {label}
      </label>
      <input
        id={registration.name}
        type={type}
        aria-invalid={!!error}
        aria-describedby={error ? `${registration.name}-error` : undefined}
        className="border-line bg-surface text-ink focus:border-accent aria-invalid:border-danger rounded-md border px-3 py-2 outline-none"
        {...registration}
      />
      {error && (
        <p id={`${registration.name}-error`} className="text-danger text-xs">
          {error.message}
        </p>
      )}
    </div>
  );
}
