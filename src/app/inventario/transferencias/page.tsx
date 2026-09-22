"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useT } from "@/lib/i18n/context";
import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

type Sucursal = { id: string; nombre: string; es_principal?: boolean; activo?: boolean };
type ItemBorrador = { producto_id: string; producto_nombre: string; cantidad: string };
type Producto = { id: string; nombre: string; sku?: string | null; stock_actual?: number | null };

type TransferenciaRow = {
  id: string; origen_sucursal_id: string; destino_sucursal_id: string;
  origen_nombre: string | null; destino_nombre: string | null;
  observacion: string | null; estado: string; created_at: string;
  created_by_nombre: string | null;
};
type TransferenciaItem = {
  id: string; transferencia_id: string; producto_id: string;
  producto_nombre: string | null; cantidad: number;
};

function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}`;
}

async function unwrap<T>(r: Response): Promise<T> {
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? j?.message ?? `Error ${r.status}`);
  // API responses vienen envueltos por successResponse: { data: ... }
  return (j?.data ?? j) as T;
}

/** Circulito numerado del paso: turquesa cuando esta activo/hecho, gris cuando falta. */
function PasoNumero({ n, activo, hecho }: { n: number; activo: boolean; hecho: boolean }) {
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 transition-colors ${
        hecho
          ? "bg-[#4FAEB2] text-white ring-[#4FAEB2]"
          : activo
            ? "bg-white text-[#3F8E91] ring-[#4FAEB2]"
            : "bg-slate-100 text-slate-400 ring-slate-200"
      }`}
    >
      {hecho ? "✓" : n}
    </span>
  );
}

export default function TransferenciasStockPage() {
  const t = useT();
  const { usuario, isLoading: cargandoUsuario } = useUsuarioActual();
  const esAdmin = esRolAdminEmpresaOGlobal(usuario?.rol ?? null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [observacion, setObservacion] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [items, setItems] = useState<ItemBorrador[]>([]);
  // Stock de la sucursal ORIGEN (producto_id → cantidad). `productos.stock_actual`
  // es el total de la empresa (suma de todas las sucursales), así que no sirve
  // para decidir qué se puede mover desde una sucursal puntual.
  const [stockOrigen, setStockOrigen] = useState<Record<string, number>>({});
  const [cargandoStock, setCargandoStock] = useState(false);

  const [historia, setHistoria] = useState<TransferenciaRow[]>([]);
  const [historiaItems, setHistoriaItems] = useState<TransferenciaItem[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Paso 1 completo = las dos sucursales elegidas y distintas. Hasta que eso
  // pase no mostramos NADA de productos: sin origen el catalogo no significa
  // nada, porque no sabemos de donde puede salir la mercaderia.
  const rutaLista = Boolean(origen && destino && origen !== destino);

  // Ninguna línea puede pedir más de lo que hay en la sucursal de origen (el
  // backend además lo revalida al confirmar).
  const hayExceso = items.some((it) => Number(it.cantidad) > (stockOrigen[it.producto_id] ?? 0));
  const puedeEnviar = rutaLista && items.length > 0 && !enviando && !hayExceso;

  const nombreOrigen = sucursales.find((s) => s.id === origen)?.nombre ?? "";
  const nombreDestino = sucursales.find((s) => s.id === destino)?.nombre ?? "";

  async function cargarSucursales() {
    try {
      const d = await unwrap<{ sucursales: Sucursal[] }>(
        await fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" }),
      );
      setSucursales(d.sucursales ?? []);
    } catch { /* tolerar */ }
  }

  async function cargarHistorial() {
    try {
      const d = await unwrap<{ transferencias: TransferenciaRow[]; items: TransferenciaItem[]; warning?: string }>(
        await fetchWithSupabaseSession("/api/inventario/transferencias", { cache: "no-store" }),
      );
      setHistoria(d.transferencias ?? []);
      setHistoriaItems(d.items ?? []);
      // El endpoint devuelve `warning` cuando la tabla todavía no existe en
      // este deploy — mostramos ese aviso en lugar de un rojo de error.
      if (d.warning) setError(d.warning);
      else setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
    }
  }

  useEffect(() => {
    cargarSucursales();
    cargarHistorial();
  }, []);

  // El catálogo se trae recién cuando ya hay una ruta elegida. Antes de eso la
  // pantalla no muestra productos, así que tampoco tiene sentido descargarlos.
  const [catalogoPedido, setCatalogoPedido] = useState(false);
  useEffect(() => {
    if (!rutaLista || catalogoPedido) return;
    setCatalogoPedido(true);
    let cancel = false;
    setBuscando(true);
    Promise.all([
      fetchWithSupabaseSession(`/api/franjas/publicas`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetchWithSupabaseSession(`/api/productos`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ])
      .then(([jf, jp]) => {
        if (cancel) return;
        const franjas = (jf?.data?.franjas as Producto[] | undefined) ?? [];
        const otros = ((jp?.data?.productos as Producto[] | undefined) ?? [])
          .filter((p) => !franjas.some((f) => f.id === p.id));
        setResultados([...franjas, ...otros]);
      })
      .finally(() => { if (!cancel) setBuscando(false); });
    return () => { cancel = true; };
  }, [rutaLista, catalogoPedido]);

  // Al elegir/cambiar la sucursal de origen, recargar su stock real y limpiar
  // las líneas ya cargadas (venían de otro depósito).
  useEffect(() => {
    if (!origen) { setStockOrigen({}); return; }
    setItems([]);
    let cancel = false;
    setCargandoStock(true);
    fetchWithSupabaseSession(
      `/api/inventario/stock-por-sucursal?sucursal_id=${encodeURIComponent(origen)}`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((j) => { if (!cancel) setStockOrigen((j?.data?.stocks ?? {}) as Record<string, number>); })
      .catch(() => { if (!cancel) setStockOrigen({}); })
      .finally(() => { if (!cancel) setCargandoStock(false); });
    return () => { cancel = true; };
  }, [origen]);

  const stockDe = (productoId: string) => stockOrigen[productoId] ?? 0;

  // Cada sucursal maneja su propio catálogo: mostrar TODAS las franjas de la
  // empresa llenaba la lista de productos que ese local no tiene (todos en
  // "0 disp."). Por defecto listamos solo lo que esa sucursal tiene en stock.
  const [verTodo, setVerTodo] = useState(false);

  const disponibles = useMemo(
    () => resultados.filter((p) => (stockOrigen[p.id] ?? 0) > 0),
    [resultados, stockOrigen],
  );

  const resultadosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = verTodo ? resultados : disponibles;
    if (!q) return base.slice(0, 40);
    return base
      .filter((p) => [p.nombre, p.sku ?? ""].join(" ").toLowerCase().includes(q))
      .slice(0, 40);
  }, [busqueda, resultados, disponibles, verTodo]);

  const totalUnidades = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0),
    [items],
  );

  function agregarProducto(p: Producto) {
    setItems((prev) => {
      if (prev.some((x) => x.producto_id === p.id)) return prev;
      return [...prev, { producto_id: p.id, producto_nombre: p.nombre, cantidad: "1" }];
    });
    setBusqueda("");
  }

  function actualizarCantidad(id: string, cant: string) {
    setItems((prev) => prev.map((x) => (x.producto_id === id ? { ...x, cantidad: cant } : x)));
  }

  function quitar(id: string) {
    setItems((prev) => prev.filter((x) => x.producto_id !== id));
  }

  function invertirRuta() {
    const o = origen;
    setOrigen(destino);
    setDestino(o);
  }

  function refrescarStockOrigen() {
    if (!origen) return;
    fetchWithSupabaseSession(
      `/api/inventario/stock-por-sucursal?sucursal_id=${encodeURIComponent(origen)}`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((j) => setStockOrigen((j?.data?.stocks ?? {}) as Record<string, number>))
      .catch(() => { /* tolerar */ });
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const payload = {
      origen_sucursal_id: origen,
      destino_sucursal_id: destino,
      observacion: observacion.trim() || null,
      items: items
        .map((x) => ({
          producto_id: x.producto_id,
          producto_nombre: x.producto_nombre,
          cantidad: Number(x.cantidad),
        }))
        .filter((x) => Number.isFinite(x.cantidad) && x.cantidad > 0),
    };
    if (payload.items.length === 0) {
      setError("Cargá al menos un producto con cantidad > 0.");
      return;
    }
    const resumen = `${totalUnidades} unidad${totalUnidades === 1 ? "" : "es"} de ${nombreOrigen} a ${nombreDestino}`;
    setEnviando(true);
    try {
      await unwrap(
        await fetchWithSupabaseSession("/api/inventario/transferencias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setSuccess(`Listo: se movieron ${resumen}.`);
      setItems([]);
      setObservacion("");
      cargarHistorial();
      // La mercadería ya salió: volver a leer el stock del origen.
      refrescarStockOrigen();
      setTimeout(() => setSuccess(null), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar transferencia.");
    } finally {
      setEnviando(false);
    }
  }

  const itemsByTransferencia = useMemo(() => {
    const map = new Map<string, TransferenciaItem[]>();
    for (const it of historiaItems) {
      const arr = map.get(it.transferencia_id) ?? [];
      arr.push(it);
      map.set(it.transferencia_id, arr);
    }
    return map;
  }, [historiaItems]);

  if (!cargandoUsuario && !esAdmin) {
    return (
      <div className="space-y-6 max-w-xl">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Link href="/inventario" className="hover:text-[#4FAEB2] transition-colors">{t("Inventario")}</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">{t("Transferencias entre sucursales")}</span>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
          <h2 className="text-base font-bold mb-1">Solo el administrador puede transferir stock</h2>
          <p>Las transferencias entre sucursales están reservadas al administrador. Si necesitás mover mercadería, pedile al admin que lo haga desde su cuenta.</p>
          <div className="mt-4">
            <Link href="/inventario" className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 font-semibold underline">
              ← Volver a Inventario
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/inventario" className="hover:text-[#4FAEB2] transition-colors">{t("Inventario")}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{t("Transferencias entre sucursales")}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("Transferencias entre sucursales")}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Mové mercadería de un local a otro en tres pasos. El stock se descuenta del origen y se suma al destino en el momento.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{success}</div>}

      <form onSubmit={enviar} className="space-y-4">

        {/* PASO 1 — la ruta */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 p-6">
          <div className="flex items-center gap-3 mb-5">
            <PasoNumero n={1} activo hecho={rutaLista} />
            <div>
              <h2 className="text-sm font-bold text-slate-800">¿De dónde a dónde?</h2>
              <p className="text-xs text-slate-500">Elegí el local que entrega y el que recibe.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-2 md:items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Sale de</label>
              <select
                value={origen}
                onChange={(e) => setOrigen(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
                required
              >
                <option value="">Elegí la sucursal que entrega…</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}{s.es_principal ? " (Principal)" : ""}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={invertirRuta}
              disabled={!origen && !destino}
              title="Invertir origen y destino"
              className="hidden md:inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-[#4FAEB2] hover:text-[#3F8E91] disabled:opacity-40"
            >
              ⇄
            </button>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Llega a</label>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
                required
              >
                <option value="">Elegí la sucursal que recibe…</option>
                {sucursales.filter((s) => s.id !== origen).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}{s.es_principal ? " (Principal)" : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {rutaLista && (
            <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-lg bg-[#4FAEB2]/10 px-3 py-2 text-sm text-[#2F6E71]">
              <span className="font-semibold">{nombreOrigen}</span>
              <span>→</span>
              <span className="font-semibold">{nombreDestino}</span>
              <span className="text-xs text-[#3F8E91]">
                {cargandoStock || buscando
                  ? `· leyendo el stock de ${nombreOrigen}…`
                  : `· ${disponibles.length} franja${disponibles.length === 1 ? "" : "s"} con stock en ${nombreOrigen}`}
              </span>
            </p>
          )}
        </section>

        {/* PASO 2 — qué se mueve (bloqueado hasta tener la ruta) */}
        <section className={`rounded-xl border shadow-sm p-6 transition-colors ${
          rutaLista ? "bg-white border-slate-200 ring-1 ring-[#4FAEB2]/15" : "bg-slate-50/60 border-dashed border-slate-300"
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <PasoNumero n={2} activo={rutaLista} hecho={rutaLista && items.length > 0} />
            <div>
              <h2 className={`text-sm font-bold ${rutaLista ? "text-slate-800" : "text-slate-400"}`}>¿Qué se mueve?</h2>
              <p className="text-xs text-slate-500">
                {rutaLista
                  ? `Solo aparece lo que ${nombreOrigen} tiene hoy en stock.`
                  : "Se habilita cuando elijas las dos sucursales."}
              </p>
            </div>
          </div>

          {!rutaLista ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-500">
                Primero decinos de qué sucursal sale y a cuál va.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Recién ahí podemos mostrarte qué mercadería hay disponible para mover.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar franja o producto (ej: 19.000, FRJ-19000)…"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
                />
                <label className="inline-flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={verTodo}
                    onChange={(e) => setVerTodo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#4FAEB2]"
                  />
                  Mostrar también lo que {nombreOrigen} no tiene
                </label>
              </div>

              {buscando ? (
                <p className="text-xs text-gray-400 mt-3 animate-pulse">Cargando catálogo…</p>
              ) : resultadosFiltrados.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  {busqueda.trim() ? (
                    <>No hay coincidencias con «{busqueda.trim()}»{!verTodo && " entre lo que hay en stock"}.</>
                  ) : (
                    <>
                      {nombreOrigen} no tiene stock cargado.{" "}
                      <button type="button" onClick={() => setVerTodo(true)} className="underline font-medium text-slate-600 hover:text-slate-800">
                        Ver todo el catálogo
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <ul className="mt-3 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {resultadosFiltrados.map((p) => {
                    const disp = stockDe(p.id);
                    const sinStock = disp <= 0;
                    const yaEsta = items.some((x) => x.producto_id === p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => agregarProducto(p)}
                          disabled={sinStock || yaEsta}
                          title={sinStock ? `Sin stock en ${nombreOrigen}` : yaEsta ? "Ya está en la lista" : undefined}
                          className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors hover:bg-[#4FAEB2]/[0.07] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <span>
                            <span className="font-medium text-slate-800">{p.nombre}</span>
                            {p.sku && <span className="text-xs text-slate-400 ml-2">{p.sku}</span>}
                          </span>
                          {yaEsta ? (
                            <span className="text-xs whitespace-nowrap font-semibold text-[#3F8E91]">ya agregado</span>
                          ) : (
                            <span className={`text-xs whitespace-nowrap font-semibold tabular-nums ${sinStock ? "text-slate-400" : "text-emerald-700"}`}>
                              {disp} disp.
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {items.length > 0 && (
                <div className="mt-5 rounded-lg border border-slate-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wide">Producto</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wide w-36">Hay en origen</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wide w-40">Mover</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((it) => {
                        const disp = stockDe(it.producto_id);
                        const excede = Number(it.cantidad) > disp;
                        return (
                          <tr key={it.producto_id}>
                            <td className="px-3 py-2 text-slate-800">{it.producto_nombre}</td>
                            <td className="px-3 py-2 text-slate-600 tabular-nums">{disp}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={disp}
                                step="0.001"
                                value={it.cantidad}
                                onChange={(e) => actualizarCantidad(it.producto_id, e.target.value)}
                                className={`w-32 px-2 py-1 text-sm tabular-nums border rounded-md focus:outline-none focus:ring-2 ${
                                  excede
                                    ? "border-rose-300 bg-rose-50 text-rose-700 focus:ring-rose-300"
                                    : "border-slate-200 focus:ring-[#4FAEB2]"
                                }`}
                              />
                              {excede && (
                                <p className="mt-1 text-[11px] text-rose-600">Solo hay {disp} en {nombreOrigen}.</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => quitar(it.producto_id)}
                                title="Quitar"
                                className="text-slate-400 hover:text-red-600 text-lg leading-none"
                              >×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {/* PASO 3 — confirmar */}
        <section className={`rounded-xl border shadow-sm p-6 transition-colors ${
          items.length > 0 ? "bg-white border-slate-200 ring-1 ring-[#4FAEB2]/15" : "bg-slate-50/60 border-dashed border-slate-300"
        }`}>
          <div className="flex items-center gap-3 mb-5">
            <PasoNumero n={3} activo={items.length > 0} hecho={false} />
            <div>
              <h2 className={`text-sm font-bold ${items.length > 0 ? "text-slate-800" : "text-slate-400"}`}>Confirmar</h2>
              <p className="text-xs text-slate-500">
                {items.length > 0 ? "Revisá el resumen y registrá el movimiento." : "Se habilita cuando cargues al menos un producto."}
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Vas a mover <span className="font-bold tabular-nums">{totalUnidades}</span>{" "}
              unidad{totalUnidades === 1 ? "" : "es"} en{" "}
              <span className="font-bold tabular-nums">{items.length}</span>{" "}
              línea{items.length === 1 ? "" : "s"} de <span className="font-semibold">{nombreOrigen}</span> a{" "}
              <span className="font-semibold">{nombreDestino}</span>.
            </div>
          )}

          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observación (opcional)</label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            disabled={items.length === 0}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white disabled:bg-slate-100"
            placeholder="Motivo, quién la lleva, referencia interna…"
          />

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {hayExceso && (
              <span className="text-xs font-medium text-rose-600 sm:mr-auto">
                Hay líneas que piden más de lo que hay en {nombreOrigen}.
              </span>
            )}
            <button
              type="submit"
              disabled={!puedeEnviar}
              className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 transition-colors shadow-sm active:scale-95"
            >
              {enviando ? "Registrando…" : "Registrar transferencia"}
            </button>
          </div>
        </section>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 overflow-x-auto">
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Historial reciente</h2>
        </div>
        {historia.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">Sin transferencias registradas.</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Origen → Destino</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Productos</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Usuario</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historia.map((h) => {
                const its = itemsByTransferencia.get(h.id) ?? [];
                return (
                  <tr key={h.id} className="align-top even:bg-slate-50/40">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatFechaHora(h.created_at)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="font-medium">{h.origen_nombre ?? "?"}</span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="font-medium">{h.destino_nombre ?? "?"}</span>
                      {h.observacion && <p className="text-xs text-slate-400 mt-0.5">{h.observacion}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5">
                        {its.map((it) => (
                          <li key={it.id} className="text-xs text-slate-600">
                            {it.producto_nombre ?? it.producto_id} — <span className="font-semibold tabular-nums">{Number(it.cantidad)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{h.created_by_nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        h.estado === "confirmada"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {h.estado}
                      </span>
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
