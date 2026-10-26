import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

interface TextFieldProps {
  label: string;
  type?: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  autoComplete?: string;
  placeholder?: string;
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
  autoComplete,
  placeholder,
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={registration.name}
        className="text-ink-secondary text-[13px] font-medium"
      >
        {label}
      </label>
      <input
        id={registration.name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${registration.name}-error` : undefined}
        className="field h-9 px-3"
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
