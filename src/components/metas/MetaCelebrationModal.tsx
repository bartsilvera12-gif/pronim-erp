"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    // Autocierre a los 4s.
    const timer = setTimeout(() => onSeguirRef.current(), 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaKey]);

  // Ref estable a onSeguir para el timer del effect (evita re-run al
  // cambiar la identidad de la función entre renders).
  const onSeguirRef = useRef(onSeguir);
  onSeguirRef.current = onSeguir;

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
        {/* Trofeo */}
        <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
          {/* Rayo suave detrás */}
          {!reducedMotion && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(79,174,178,.35) 0%, transparent 70%)",
                animation: "metaBurst 2s ease-out",
              }}
            />
          )}
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-amber-400 bg-[#0F5D60] shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.6} className="h-12 w-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-3v3m5-14V4H7v3m10 0h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-.4M7 7H5a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4h.4M7 7c.5 5.5 2.5 10 5 10s4.5-4.5 5-10" />
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900">{t("¡Meta alcanzada!")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("Cumplimos el")} <strong className="text-emerald-700 tabular-nums">{meta.pct_meta}%</strong>{" "}
          {t("de la meta")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          <strong>{meta.nombre}</strong> · {money.format(meta.vendido)} / {money.format(meta.meta_periodo)}
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
