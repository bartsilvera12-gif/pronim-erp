"use client";

import { useEffect, useMemo, useState } from "react";

interface StockRow { sucursal_id: string; nombre: string; es_principal: boolean; stock_actual: number; incluido?: boolean }

interface Props {
  productoId: string;
  /** Sin uso — se mantiene para no romper llamados existentes. Todas las
   *  filas se renderizan en modo lectura. Las transferencias entre
   *  sucursales se hacen desde /inventario/transferencias. */
  canEdit?: boolean;
}

/**
 * Caja con desglose de stock per-sucursal — SOLO LECTURA.
 *
 * Modelo: Principal es el "pool" del total. Para mover stock entre
 * sucursales se usa el flujo dedicado de transferencias, no esta caja.
 */
export default function StockPorSucursalBox({ productoId }: Props) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    fetch(`/api/inventario/stock-sucursal?producto_id=${encodeURIComponent(productoId)}`, {
      credentials: "include", cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j?.success) setRows((j.data?.stocks ?? []) as StockRow[]);
      })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [productoId]);

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.stock_actual ?? 0), 0),
    [rows],
  );
  const principalRow = rows.find((r) => r.es_principal);
  const otrasRows = rows.filter((r) => !r.es_principal);

  if (cargando) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Cargando stock por sucursal…
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">Stock por sucursal</p>
        <span className="text-xs text-slate-500">
          Total disponible: <strong className="tabular-nums text-slate-800">{total}</strong>
        </span>
      </div>

      {/* Principal: lectura. No tiene checkbox ni botón porque siempre
          contiene lo que la web pública refleja; el split es elección
          solo si se manda algo a otras sucursales. */}
      {principalRow && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-2">
          <span className="text-sm text-slate-700 font-medium">
            {principalRow.nombre}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">Principal · web</span>
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-800">
            {Number(principalRow.stock_actual).toLocaleString("es-PY", { maximumFractionDigits: 3 })}
          </span>
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {otrasRows.map((r) => (
          <li key={r.sucursal_id} className="py-2 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <p className="text-sm text-slate-700 font-medium">{r.nombre}</p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-slate-800">
              {Number(r.stock_actual).toLocaleString("es-PY", { maximumFractionDigits: 3 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
