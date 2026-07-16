import type { CSSProperties, ReactNode } from "react";

/**
 * StickerBadge — sticker rectangular de papel con extremo derecho recortado
 * en forma de etiqueta. Fondo sólido, borde discontinuo 2 px, texto oscuro
 * en negrita. Sin sombras, sin gradientes, sin animaciones, sin íconos.
 *
 * Se dibuja con un SVG inline que define la forma exacta (rectángulo con
 * flag derecha) y su borde discontinuo — el borde CSS no puede seguir un
 * clip-path, así que la única forma limpia de tener el mismo borde en los
 * 4 lados (incluido el corte diagonal) es via <polygon stroke="…"/>.
 *
 * Uso:
 *   <StickerBadge type="vip">Cliente VIP</StickerBadge>
 */

export type StickerBadgeType =
  | "nuevo"
  | "frecuente"
  | "vip"
  | "mayorista"
  | "credito"
  | "deuda"
  | "inactivo";

type Props = {
  type: StickerBadgeType;
  children: ReactNode;
  title?: string;
  /** Rotación fija leve (~1.5°). Alterná entre 'left' y 'right' cuando haya varios juntos. */
  tilt?: "left" | "right" | "none";
  className?: string;
};

type Palette = { bg: string; fg: string };

// Hex values fijos, no dependen de Tailwind, así el color coincide 1:1 con
// lo especificado. bg → fondo del sticker, fg → borde + texto.
const PALETTE: Record<StickerBadgeType, Palette> = {
  nuevo:     { bg: "#FDE68A", fg: "#1E3A5F" },
  frecuente: { bg: "#BAE6FD", fg: "#075985" },
  vip:       { bg: "#DDD6FE", fg: "#5B21B6" },
  mayorista: { bg: "#BFDBFE", fg: "#1E40AF" },
  credito:   { bg: "#BBF7D0", fg: "#166534" },
  deuda:     { bg: "#FECACA", fg: "#991B1B" },
  inactivo:  { bg: "#E5E7EB", fg: "#374151" },
};

const TILT_DEG: Record<NonNullable<Props["tilt"]>, string> = {
  left:  "rotate(-1.5deg)",
  right: "rotate(1.5deg)",
  none:  "none",
};

export function StickerBadge({
  type,
  children,
  title,
  tilt = "left",
  className = "",
}: Props) {
  const p = PALETTE[type];
  const wrapperStyle: CSSProperties = {
    color: p.fg,
    transform: TILT_DEG[tilt],
    minHeight: "28px",
    padding: "6px 20px 6px 12px", // 12 izq, 20 der (deja hueco para el pico)
    lineHeight: 1,
  };
  return (
    <span
      title={title}
      aria-label={typeof children === "string" ? children : title}
      style={wrapperStyle}
      className={[
        "relative inline-flex items-center justify-center align-middle",
        "select-none pointer-events-none",
        "text-[11px] font-bold uppercase tracking-[0.06em]",
        className,
      ].join(" ")}
    >
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 40"
      >
        <polygon
          points="2,2 90,2 98,20 90,38 2,38"
          fill={p.bg}
          stroke={p.fg}
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative whitespace-nowrap">{children}</span>
    </span>
  );
}
