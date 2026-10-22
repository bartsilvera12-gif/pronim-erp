"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Modal overlay que embebe la vista consolidada del cliente
 * (/clientes/[id]/consultas) en un iframe.
 *
 * Se usa desde /venta/nueva y /atencion/nueva al clickear el nombre del
 * cliente en la card superior — así la cajera consulta saldos, historial,
 * beneficios y notas sin salir de la caja.
 */
type Vista = "consultas" | "ficha";

export function ClienteDetalleModal(props: {
  clienteId: string;
  clienteNombre?: string;
  onClose: () => void;
}) {
  const { clienteId, clienteNombre, onClose } = props;
  // La ficha editable va en el mismo modal: antes, para corregir un
  // teléfono durante una venta había que salirse de la venta.
  const [vista, setVista] = useState<Vista>("consultas");

  // Cerrar con ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[92vh] rounded-xl bg-white shadow-2xl overflow-hidden flex flex-col"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Detalle del cliente</p>
            <h2 className="text-sm font-bold text-slate-800 truncate">{clienteNombre ?? "Cliente"}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              {(["consultas", "ficha"] as Vista[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVista(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    vista === v
                      ? "bg-[#4FAEB2] text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {v === "consultas" ? "Resumen" : "Editar ficha"}
                </button>
              ))}
            </div>
            {/* Pestaña nueva: abrirla en la misma se llevaba puesta la
                venta o evaluación que se estaba cargando. */}
            <Link
              href={`/clientes/${clienteId}`}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Abrir ficha completa ↗
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              Cerrar ✕
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0 bg-white">
          <iframe
            src={vista === "ficha"
              ? `/clientes/${clienteId}?embed=1`
              : `/clientes/${clienteId}/consultas?embed=1`}
            className="w-full h-full border-0"
            title={`Detalle de ${clienteNombre ?? "cliente"}`}
          />
        </div>
      </div>
    </div>
  );
}
