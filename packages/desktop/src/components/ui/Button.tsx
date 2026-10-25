import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-sm shadow-accent/25 hover:bg-accent-hover hover:shadow-md hover:shadow-accent/30',
  secondary:
    'border border-line-strong bg-surface-raised text-ink shadow-xs shadow-black/[0.04] hover:border-ink-faint/60 hover:bg-chrome',
  ghost: 'text-ink-muted hover:text-ink hover:bg-chrome-strong',
  // Mismo par bg/on-accent que primary, con --color-danger en vez de
  // --color-accent — reservado para el botón de confirmar dentro de
  // ConfirmModal, nunca para una acción disparada directo desde una fila.
  danger: 'bg-danger text-on-accent shadow-sm hover:brightness-110',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-[13px]',
  md: 'h-9 gap-2 rounded-lg px-4 text-sm',
};

// El acento sólido (variant="primary") queda reservado para UN botón por
// pantalla — el resto usa "secondary"/"ghost", nunca el mismo naranja
// repetido en cada elemento clickeable (ver ajuste de diseño post-#46).
// focus-visible (no focus a secas) — el anillo aparece por teclado, no en
// cada click de mouse; sin esto, Tab por la app no mostraba dónde está el
// foco en ningún botón. active:scale da la respuesta táctil del click sin
// mover el layout (transform, no margin).
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`focus-visible:ring-accent focus-visible:ring-offset-surface ease-snappy inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
