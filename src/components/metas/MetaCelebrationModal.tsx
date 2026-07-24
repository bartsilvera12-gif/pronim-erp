"use client";

import { useEffect, useMemo, useState } from "react";
import { useT, useMoney } from "@/lib/i18n/context";
import { playCelebrationSound, playFanfare, initNotifSounds } from "@/lib/audio/notif-sounds";

/**
 * Modal celebratorio de meta alcanzada.
 *
 * - Confeti SVG + destello 2s (sin librería externa; respeta
 *   prefers-reduced-motion → sin animación).
 * - Tarjeta centrada 4s (autocierre) o hasta que el usuario haga click
 *   en un botón.
 * - Al cerrarse llama onAck para que el caller marque la meta como
 *   celebrada en el backend.
 *
 * NO renderiza nada si `meta` es null.
 */

type Meta = {
  sucursal_id: string;
  nombre: string;
  pct_meta: number;
  vendido: number;
  meta_periodo: number;
};

export function MetaCelebrationModal({
  meta,
  onSeguir,
  onVerResultados,
}: {
  meta: Meta | null;
  onSeguir: () => void;
  onVerResultados?: () => void;
}) {
  const t = useT();
  const money = useMoney();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Solo dep del id de sucursal — así el effect no re-corre en cada
  // render (onSeguir cambia de referencia cada render). Antes, el
  // sonido se cortaba porque playCelebrationSound() se llamaba varias
  // veces seguidas y cada AudioContext se pisaba al siguiente.
  const metaKey = meta?.sucursal_id ?? null;
  useEffect(() => {
    if (!metaKey) return;
    // Asegura que el listener de unlock está instalado (idempotente).
    initNotifSounds();
    // Doble sonido: playCelebrationSound (ding-ding-ding rápido) +
    // playFanfare (6 notas ascendentes más celebratorio). Se solapan
    // como una fanfarria festiva.
    playCelebrationSound();
    playFanfare();
    // NO hay autocierre — Karen pidió que el modal quede hasta que
    // alguien apriete "Ver resultados" o "Seguir trabajando". Así la
    // celebración se ve aunque nadie esté mirando la pantalla en el
    // momento exacto en que se cumple la meta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaKey]);

// Confeti — SVG absolut, se recalcula solo cuando cambia la meta.
  const confetti = useMemo(() => {
    if (!meta || reducedMotion) return null;
    const colors = ["#4FAEB2", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#f43f5e"];
    const pieces = Array.from({ length: 40 }, (_, i) => {
      const left = (i * 2.7) % 100;
      const delay = (i % 12) * 0.08;
      const size = 6 + ((i * 7) % 10);
      const dur = 1.8 + ((i * 13) % 7) / 10;
      const color = colors[i % colors.length];
      const rot = (i * 47) % 360;
      return { left, delay, size, dur, color, rot, key: i };
    });
    return pieces;
  }, [meta, reducedMotion]);

  if (!meta) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("¡Meta alcanzada!")}
    >
      {/* Overlay muy tenue para no bloquear visualmente */}
      <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px]" />

      {/* Confetti */}
      {confetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((p) => (
            <span
              key={p.key}
              className="absolute top-0 block"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size * 0.4,
                background: p.color,
                borderRadius: 2,
                transform: `rotate(${p.rot}deg)`,
                animation: `metaConfettiFall ${p.dur}s cubic-bezier(.2,.6,.4,1) ${p.delay}s forwards`,
                opacity: 0,
              }}
            />
          ))}
          <style>{`
            @keyframes metaConfettiFall {
              0%   { transform: translate3d(0,-10%,0) rotate(0deg); opacity: 0; }
              10%  { opacity: 1; }
              100% { transform: translate3d(0,110vh,0) rotate(720deg); opacity: 0; }
            }
            @keyframes metaBurst {
              0%   { transform: scale(.6); opacity: 0; }
              40%  { transform: scale(1.05); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Tarjeta central */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center"
        style={{ animation: reducedMotion ? undefined : "metaBurst .5s cubic-bezier(.2,.6,.4,1)" }}
      >
        {/* Trofeo — rediseño con estrellas irradiando + copa dorada
            volumétrica (gradiente + brillo + base). */}
        <div className="relative mx-auto mb-5 flex h-32 w-32 items-center justify-center">
          {/* Halo dorado radial pulsante */}
          {!reducedMotion && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(251,191,36,.45) 0%, rgba(251,191,36,.12) 45%, transparent 72%)",
                animation: "metaBurst 2.5s ease-out",
              }}
            />
          )}
          {/* Estrellas irradiando */}
          {!reducedMotion && (
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full"
              style={{ animation: "metaStarSpin 8s linear infinite" }}
            >
              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <g key={i} transform={`rotate(${deg} 50 50)`}>
                  <path
                    d="M50 8 L51.5 13 L57 13 L52.5 16 L54 21 L50 18 L46 21 L47.5 16 L43 13 L48.5 13 Z"
                    fill="#fbbf24"
                    opacity={0.85}
                  />
                </g>
              ))}
            </svg>
          )}
          {/* Copa */}
          <svg viewBox="0 0 96 96" className="relative z-10 h-24 w-24 drop-shadow-lg">
            <defs>
              <linearGradient id="copaGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fde68a" />
                <stop offset="45%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
              <linearGradient id="copaGoldRim" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#b45309" />
                <stop offset="50%" stopColor="#fde68a" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
              <radialGradient id="copaShine" cx="0.35" cy="0.25" r="0.5">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
                <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Asas laterales */}
            <path
              d="M22 26 C 10 26, 6 34, 10 44 C 12 50, 20 52, 26 50"
              fill="none"
              stroke="url(#copaGold)"
              strokeWidth={5}
              strokeLinecap="round"
            />
            <path
              d="M74 26 C 86 26, 90 34, 86 44 C 84 50, 76 52, 70 50"
              fill="none"
              stroke="url(#copaGold)"
              strokeWidth={5}
              strokeLinecap="round"
            />
            {/* Copa (cáliz) */}
            <path
              d="M22 20 L74 20 L70 52 C 68 62, 58 68, 48 68 C 38 68, 28 62, 26 52 Z"
              fill="url(#copaGold)"
              stroke="#78350f"
              strokeWidth={0.8}
            />
            {/* Borde superior */}
            <rect x="20" y="18" width="56" height="6" rx="1" fill="url(#copaGoldRim)" stroke="#78350f" strokeWidth={0.6} />
            {/* Brillo diagonal */}
            <ellipse cx="38" cy="34" rx="8" ry="14" fill="url(#copaShine)" transform="rotate(-18 38 34)" />
            {/* Estrella central en la copa */}
            <path
              d="M48 32 L50 38 L56 38 L51 42 L53 48 L48 44 L43 48 L45 42 L40 38 L46 38 Z"
              fill="#fef3c7"
              stroke="#b45309"
              strokeWidth={0.5}
            />
            {/* Tallo */}
            <rect x="44" y="68" width="8" height="8" fill="url(#copaGold)" stroke="#78350f" strokeWidth={0.6} />
            {/* Base — pedestal en 2 niveles */}
            <rect x="36" y="76" width="24" height="4" rx="1" fill="url(#copaGold)" stroke="#78350f" strokeWidth={0.6} />
            <rect x="30" y="80" width="36" height="6" rx="1.5" fill="url(#copaGold)" stroke="#78350f" strokeWidth={0.6} />
            {/* Sombra inferior de la base */}
            <ellipse cx="48" cy="88" rx="20" ry="2" fill="#000" opacity="0.15" />
          </svg>
          <style>{`
            @keyframes metaStarSpin {
              0%   { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>

        <h2 className="text-2xl font-bold text-slate-900">
          {t("¡Meta alcanzada en")} <span className="text-[#0F5D60]">{meta.nombre}</span>!
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("Cumplimos el")} <strong className="text-emerald-700 tabular-nums">{meta.pct_meta}%</strong>{" "}
          {t("de la meta")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {money.format(meta.vendido)} / {money.format(meta.meta_periodo)}
        </p>
        <p className="mt-3 text-sm text-slate-700">{t("¡Excelente trabajo, equipo!")}</p>

        <div className="mt-6 space-y-2">
          {onVerResultados && (
            <button
              type="button"
              onClick={() => { onVerResultados(); onSeguir(); }}
              className="w-full rounded-lg bg-[#0F5D60] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0a4547]"
            >
              {t("Ver resultados")}
            </button>
          )}
          <button
            type="button"
            onClick={onSeguir}
            className="w-full rounded-lg border-none bg-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            {t("Seguir trabajando")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Badge discreto que sale abajo del hero de la caja / dashboard después
 * de la celebración: "✓ Meta cumplida hoy".
 */
export function MetaCumplidaBadge({ nombre }: { nombre: string }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.2a1 1 0 0 0-1.4-1.4L9 10.7 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" clipRule="evenodd" />
      </svg>
      {t("Meta cumplida")}
      {nombre ? <span className="font-normal opacity-70">· {nombre}</span> : null}
    </span>
  );
}
