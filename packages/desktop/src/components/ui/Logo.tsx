interface LogoProps {
  size?: number;
  showWordmark?: boolean;
}

// Ícono de marca: cubo isométrico de 3 caras (ver src/assets/opera-icon.svg,
// fuente de verdad del arte — este SVG inline reproduce esos mismos puntos
// tal cual, no una reinterpretación). Inline en vez de <img> para poder
// controlar tamaño vía props sin depender de una carga de red/archivo.
// Los fills usan la paleta de marca (--brand-*, ver index.css) — fija,
// independiente del acento ámbar de la interfaz.
export function Logo({ size = 32, showWordmark = false }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        role="img"
        aria-label="Opera"
      >
        <polygon
          points="21,37.5 60,15 99,37.5 60,60"
          fill="var(--brand-blue)"
        />
        <polygon
          points="99,37.5 99,82.5 60,105 60,60"
          fill="var(--brand-graphite)"
        />
        <polygon
          points="60,105 21,82.5 21,37.5 60,60"
          fill="var(--brand-navy)"
        />
      </svg>
      {showWordmark && (
        <span
          className="text-ink font-medium tracking-widest uppercase"
          style={{ fontSize: size * 0.5 }}
        >
          Opera
        </span>
      )}
    </span>
  );
}
