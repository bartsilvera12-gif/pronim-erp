"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Banner de aviso que se muestra cuando hay recepciones de clientes que
 * fueron cargadas pero AÚN NO se ingresaron al stock (estado
 * 'pendiente_ingreso' — típicamente la ropa quedó en la bolsa esperando
 * evaluación / ingreso definitivo).
 *
 * Consume /api/recepciones/pendientes. Si `sucursalId` viene, filtra en
 * el cliente para mostrar solo las de esa sucursal. Se auto-refresca al
 * cambiar de sucursal.
 *
 * Muestra:
 *   - Contador grande de pendientes
 *   - Cuántas están hace más de 72h (rojo)
 *   - Lista compacta de las últimas 5, expandible
 *   - Link a la bandeja completa (/atencion/pendientes-ingreso)
 */

type Recepcion = {
  id: string;
  numero_control: string;
  cliente_id: string | null;
  fecha: string;
  total_compra: number | string | null;
  total_credito: number | string | null;
  observaciones: string | null;
  sucursal_id: string | null;
  ingresada_at: string | null;
  estado: string;
  usuario_nombre: string | null;
};

type Payload = {
  recepciones: Recepcion[];
  clientes: Record<string, string>;
};

export default function PendientesEvaluacionBanner({
  sucursalId,
}: {
  sucursalId?: string | null;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [expandido, setExpandido] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchWithSupabaseSession("/api/recepciones/pendientes", { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (cancel || !j?.success) return;
        setData(j.data as Payload);
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  if (loading || !data) return null;

  // Filtro cliente-side por sucursal si viene
  const recepciones = sucursalId
    ? data.recepciones.filter(r => r.sucursal_id === sucursalId)
    : data.recepciones;
  if (recepciones.length === 0) return null;

  const now = Date.now();
  const vencidas = recepciones.filter(r => {
    const t = new Date(r.fecha).getTime();
    return (now - t) > 72 * 3600 * 1000;
  }).length;
  const total = recepciones.length;
  const mostradas = expandido ? recepciones : recepciones.slice(0, 5);

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Ícono de alerta */}
        <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008ZM12 4c-4 5-6 8-6 11a6 6 0 0 0 12 0c0-3-2-6-6-11Z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-base font-bold text-amber-900">
              {total === 1
                ? "1 recepción pendiente de evaluar"
                : `${total} recepciones pendientes de evaluar`}
            </h3>
            {vencidas > 0 && (
              <span className="inline-flex items-center rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                {vencidas} lleva{vencidas === 1 ? "" : "n"} más de 72 h
              </span>
            )}
          </div>
          <p className="text-xs text-amber-800 mt-1">
            Estas ropas fueron recibidas del cliente pero todavía no fueron ingresadas al stock.
            Revisá cada bolsa, definí el monto final si corresponde y confirmalas para que aparezcan en el inventario.
          </p>

          {/* Lista compacta */}
          <div className="mt-3 space-y-1">
            {mostradas.map(r => {
              const cliente = (r.cliente_id && data.clientes[r.cliente_id]) || "(sin cliente)";
              const horas = Math.floor((now - new Date(r.fecha).getTime()) / (3600 * 1000));
              const dias = Math.floor(horas / 24);
              const cuantoHace = dias >= 1 ? `hace ${dias}d` : `hace ${horas}h`;
              const vencida = horas > 72;
              return (
                <div key={r.id} className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${vencida ? "bg-rose-50" : "bg-white/60"}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${vencida ? "bg-rose-500" : "bg-amber-500"}`} />
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">{r.numero_control}</span>
                  <span className="flex-1 truncate text-slate-700">{cliente}</span>
                  <span className={`text-[10px] font-semibold shrink-0 ${vencida ? "text-rose-700" : "text-amber-700"}`}>{cuantoHace}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-3">
            {recepciones.length > 5 && (
              <button
                type="button"
                onClick={() => setExpandido(v => !v)}
                className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline"
              >
                {expandido ? "Ver menos" : `Ver todas (${recepciones.length})`}
              </button>
            )}
            <Link
              href="/atencion/pendientes-ingreso"
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold shadow-sm"
            >
              Ir a la bandeja de pendientes
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M5 10a.75.75 0 0 1 .75-.75h6.638L10.23 7.29a.75.75 0 1 1 1.04-1.08l3.5 3.25a.75.75 0 0 1 0 1.08l-3.5 3.25a.75.75 0 1 1-1.04-1.08l2.158-1.96H5.75A.75.75 0 0 1 5 10Z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
