"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Check, ChevronDown } from "lucide-react";
import { useSucursalActiva } from "@/lib/sucursales/activa";

/**
 * Selector "¿en qué sucursal estoy?" del header.
 *
 * Solo se muestra a usuarios SIN sucursal fija (admin global) y cuando hay más
 * de una sucursal. Para el resto no aparece: su sucursal la impone el backend.
 *
 * Mientras el admin no elija, se avisa en ámbar que las operaciones caen en la
 * sucursal Principal — que es justamente el comportamiento que confundía.
 */
export default function SucursalActivaSelector() {
  const { sucursales, puedeElegir, sucursalId, nombre, sinElegir, elegir, cargando } = useSucursalActiva();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (cargando || !puedeElegir) return null;

  return (
    <div className="relative print:hidden" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Sucursal en la que estás operando"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          sinElegir
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-[#4FAEB2]/40 bg-[#4FAEB2]/10 text-[#3F8E91] hover:bg-[#4FAEB2]/20"
        }`}
      >
        <MapPin className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{nombre ?? "Elegí sucursal"}</span>
        <span className="sm:hidden">{(nombre ?? "Sucursal").slice(0, 8)}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Estoy operando en
          </p>
          <ul className="space-y-0.5">
            {sucursales.map((s) => {
              const activa = s.id === sucursalId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => { elegir(s.id); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      activa ? "bg-[#4FAEB2]/10 font-semibold text-[#3F8E91]" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">
                      {s.nombre}
                      {s.es_principal && <span className="ml-1 text-[10px] font-normal text-slate-400">(Principal)</span>}
                    </span>
                    {activa && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 border-t border-slate-100 px-2 pt-2 text-[10px] leading-relaxed text-slate-500">
            Las ventas, evaluaciones y la caja se registran en esta sucursal.
            {sinElegir && " Sin elegir, se usa la Principal."}
          </p>
        </div>
      )}
    </div>
  );
}
