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
        className="text-sm font-medium text-slate-300"
      >
        {label}
      </label>
      <input
        id={registration.name}
        type={type}
        aria-invalid={!!error}
        aria-describedby={error ? `${registration.name}-error` : undefined}
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-slate-400 aria-invalid:border-red-500"
        {...registration}
      />
      {error && (
        <p id={`${registration.name}-error`} className="text-xs text-red-400">
          {error.message}
        </p>
      )}
    </div>
  );
}
