import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary:
    'border border-line text-ink hover:bg-surface-raised hover:border-line-strong',
  ghost: 'text-ink-muted hover:text-ink hover:bg-chrome-strong',
};

// El acento sólido (variant="primary") queda reservado para UN botón por
// pantalla — el resto usa "secondary"/"ghost", nunca el mismo naranja
// repetido en cada elemento clickeable (ver ajuste de diseño post-#46).
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
