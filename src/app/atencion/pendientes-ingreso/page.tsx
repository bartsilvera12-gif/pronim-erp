"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Recepcion = {
  id: string;
  numero_control: string | null;
  cliente_id: string;
  fecha: string;
  total_compra: number | string;
  total_credito: number | string;
  observaciones: string | null;
  sucursal_id: string | null;
  ingresada_at: string | null;
  estado: string;
  usuario_nombre: string | null;
};

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}
function fmtFechaHora(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return iso; }
}
function horasDesde(iso: string): number {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.floor(ms / (1000 * 60 * 60));
  } catch { return 0; }
}

export default function PendientesIngresoPage() {
  const [recepciones, setRecepciones] = useState<Recepcion[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingresandoId, setIngresandoId] = useState<string | null>(null);

  async function cargar() {
    setError(null); setCargando(true);
    try {
      const res = await fetchWithSupabaseSession("/api/recepciones/pendientes", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.success === false) throw new Error(j?.error ?? `Error ${res.status}`);
      setRecepciones((j?.data?.recepciones ?? []) as Recepcion[]);
      setClientes((j?.data?.clientes ?? {}) as Record<string, string>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las pendientes.");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function ingresar(r: Recepcion) {
    setIngresandoId(r.id);
    try {
      const rr = await fetchWithSupabaseSession(
        `/api/clientes/${r.cliente_id}/recepciones/${r.id}/ingresar`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const j = await rr.json().catch(() => ({}));
      if (!rr.ok || j?.success === false) throw new Error(j?.error ?? `Error ${rr.status}`);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ingresar la recepción.");
    } finally {
      setIngresandoId(null);
    }
  }

  const vencidas = recepciones.filter((r) => horasDesde(r.fecha) > 72);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recepciones pendientes de ingreso</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Mercadería que recibiste pero todavía no fue ingresada al stock. Ingresá a medida que la vayas catalogando.
          </p>
        </div>
        <Link
          href="/atencion/nueva"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Volver a Caja
        </Link>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {vencidas.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ Hay <strong>{vencidas.length}</strong> recepción(es) con más de 72 horas sin ingresar al stock. Priorizá esas.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 overflow-x-auto">
        {cargando ? (
          <p className="py-16 text-center text-sm text-gray-400 animate-pulse">Cargando…</p>
        ) : recepciones.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">No hay recepciones pendientes de ingreso.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Cliente</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">N° control</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Total compra</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Antigüedad</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recepciones.map((r) => {
                const horas = horasDesde(r.fecha);
                const vencida = horas > 72;
                return (
                  <tr key={r.id} className={vencida ? "bg-amber-50/50" : ""}>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{fmtFechaHora(r.fecha)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/clientes/${r.cliente_id}`} className="font-medium text-slate-800 hover:underline">
                        {clientes[r.cliente_id] ?? "Cliente"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.numero_control ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtGs(Number(r.total_compra) || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        vencida
                          ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      }`}>
                        {horas < 1 ? "reciente" : horas < 24 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} día(s)`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => ingresar(r)}
                        disabled={ingresandoId === r.id}
                        className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
                      >
                        {ingresandoId === r.id ? "Ingresando…" : "Ingresar al stock"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
