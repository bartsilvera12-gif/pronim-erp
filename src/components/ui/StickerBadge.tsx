import type { ReactNode } from "react";

/**
 * StickerBadge — etiqueta estilo "sticker recortado" para señalizar segmentos
 * de cliente y estados relacionados. Diseño plano (sin sombras, sin 3D, sin
 * animaciones, sin íconos). Sólo Tailwind + SVG inline para el borde
 * discontinuo que sigue la forma recortada.
 *
 * Uso:
 *   <StickerBadge type="vip">Cliente VIP</StickerBadge>
 *   <StickerBadge type="deuda" title="3 reclamos previos">Con reclamos previos</StickerBadge>
 *
 * NO es interactivo: pointer-events-none + no role button + sin cursor pointer.
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
  /** Rotación fija leve. Alterná entre 'left' y 'right' cuando haya varios juntos. */
  tilt?: "left" | "right" | "none";
  className?: string;
};

type Palette = {
  text: string;
  fill: string;
  stroke: string;
};

// Clases completas en el fuente (JIT las detecta). Sombras / gradientes / anim: prohibido.
const PALETTE: Record<StickerBadgeType, Palette> = {
  nuevo:     { text: "text-amber-900",   fill: "fill-amber-100",   stroke: "stroke-amber-600" },
  frecuente: { text: "text-sky-900",     fill: "fill-sky-100",     stroke: "stroke-sky-600" },
  vip:       { text: "text-violet-900",  fill: "fill-violet-100",  stroke: "stroke-violet-600" },
  mayorista: { text: "text-blue-900",    fill: "fill-blue-100",    stroke: "stroke-blue-600" },
  credito:   { text: "text-emerald-900", fill: "fill-emerald-100", stroke: "stroke-emerald-600" },
  deuda:     { text: "text-rose-900",    fill: "fill-rose-100",    stroke: "stroke-rose-600" },
  inactivo:  { text: "text-slate-700",   fill: "fill-slate-100",   stroke: "stroke-slate-400" },
};

const TILT: Record<NonNullable<Props["tilt"]>, string> = {
  left:  "-rotate-2",
  right: "rotate-1",
  none:  "",
};

export function StickerBadge({
  type,
  children,
  title,
  tilt = "left",
  className = "",
}: Props) {
  const p = PALETTE[type];
  return (
    <span
      title={title}
      aria-label={typeof children === "string" ? children : title}
      className={[
        "relative inline-flex items-center justify-center align-middle",
        "select-none pointer-events-none",
        "px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] leading-none",
        p.text,
        TILT[tilt],
        className,
      ].join(" ")}
    >
      {/* Etiqueta recortada: relleno + borde discontinuo fino que sigue la forma. */}
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 40"
      >
        <polygon
          points="3,8 8,0 92,0 97,8 100,20 97,32 92,40 8,40 3,32 0,20"
          className={`${p.fill} ${p.stroke}`}
          strokeWidth={1.25}
          strokeDasharray="3 2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative whitespace-nowrap">{children}</span>
    </span>
  );
}
