"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import { getClientes, clienteNombre } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";
import { etiquetaVisibleTipoServicio, type ClienteTipoServicioRow } from "@/lib/clientes/tipo-servicio-catalogo";
import { filasTiposDesdeSistemaEstatico, fetchTiposFormCliente } from "@/lib/clientes/fetch-tipos-servicio-form";
import { useUserCfg, useMoney } from "@/lib/i18n/context";
import { ModalGuardarSegmento } from "@/components/tabla/segmentos-guardados";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return ""; }
}

// ── Badges ────────────────────────────────────────────────────────────────────

function BadgeEstado({ estado }: { estado: Cliente["estado"] }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      estado === "activo"
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-500"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${estado === "activo" ? "bg-green-500" : "bg-gray-400"}`} />
      {estado === "activo" ? "Activo" : "Inactivo"}
    </span>
  );
}

function BadgeOrigen({ origen }: { origen: Cliente["origen"] }) {
  const cfg = {
    CRM:    "bg-violet-100 text-violet-700",
    VENTA:  "bg-blue-100 text-blue-700",
    MANUAL: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg[origen]}`}>
      {origen}
    </span>
  );
}

// ── Columnas configurables ────────────────────────────────────────────────────

const CLIENTES_COLUMNAS_STORAGE_KEY = "neura.erp.clientes.columnas.v1";

type ClienteColumnKey =
  | "codigo"
  | "empresa_nombre"
  | "contacto"
  | "telefono"
  | "plan_activo"
  | "origen"
  | "tipo_servicio"
  | "estado"
  | "desde"
  | "creado_por"
  | "ruc_documento"
  | "email"
  | "vendedor_responsable"
  | "ultima_compra"
  | "total_comprado"
  | "cantidad_compras"
  | "credito_disponible";

type ClienteColumnDef = {
  key: ClienteColumnKey;
  label: string;
  visibleDefault: boolean;
  required?: boolean;
  headerClassName?: string;
  className?: string;
  render: (cliente: Cliente) => ReactNode;
};

const DEFAULT_VISIBLE_COLUMN_KEYS: ClienteColumnKey[] = [
  "codigo",
  "empresa_nombre",
  "contacto",
  "telefono",
  "ultima_compra",
  "total_comprado",
  "origen",
  "estado",
];

function normalizeVisibleColumnKeys(raw: unknown, columns: ClienteColumnDef[]): ClienteColumnKey[] {
  const validKeys = new Set(columns.map((c) => c.key));
  const requiredKeys = columns.filter((c) => c.required).map((c) => c.key);
  const source = Array.isArray(raw) ? raw : DEFAULT_VISIBLE_COLUMN_KEYS;
  const next = source.filter((k): k is ClienteColumnKey => typeof k === "string" && validKeys.has(k as ClienteColumnKey));

  for (const key of requiredKeys) {
    if (!next.includes(key)) next.push(key);
  }
  return next.length > 0 ? next : [...DEFAULT_VISIBLE_COLUMN_KEYS];
}

function documentoCliente(c: Cliente): string {
  return c.ruc?.trim() || c.documento?.trim() || "—";
}

function VendedorResponsableCell({ cliente }: { cliente: Cliente }) {
  const nombre = cliente.vendedor_usuario_nombre?.trim();
  const email = cliente.vendedor_usuario_email?.trim();
  const legacy = cliente.vendedor_asignado?.trim();

  if (cliente.vendedor_usuario_id) {
    return nombre || email || "Usuario ERP asignado";
  }

  if (legacy) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{legacy}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Texto libre
        </span>
      </span>
    );
  }

  return <span className="text-slate-400">Sin asignar</span>;
}

function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function buildClienteColumns(mapNombreTipo: Record<string, string>, fmtMoney: (n: number) => string): ClienteColumnDef[] {
  const th = "text-left text-xs font-semibold text-slate-600 px-5 py-3 whitespace-nowrap";
  const td = "px-5 py-3.5";
  return [
    {
      key: "codigo",
      label: "Código",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => (
        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {c.codigo_cliente}
        </span>
      ),
    },
    {
      key: "empresa_nombre",
      label: "Empresa / Nombre",
      visibleDefault: true,
      required: true,
      headerClassName: th,
      className: td,
      render: (c) => (
        <div className="flex items-center gap-2 min-w-56">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
            c.tipo_cliente === "empresa" ? "bg-blue-500" : "bg-violet-500"
          }`}>
            {c.tipo_cliente === "empresa" ? "E" : "P"}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">
                {clienteNombre(c)}
              </p>
              {c.perfil_tributario_activo && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Tributario
                </span>
              )}
            </div>
            {c.tipo_cliente === "empresa" && c.ruc && (
              <p className="text-xs text-gray-400">RUC: {c.ruc}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "contacto",
      label: "Contacto",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-sm text-gray-700 whitespace-nowrap`,
      render: (c) => (c.tipo_cliente === "empresa" ? c.nombre_contacto : (c.ciudad ?? "—")),
    },
    {
      key: "telefono",
      label: "Teléfono",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-sm text-gray-600 whitespace-nowrap`,
      render: (c) => c.telefono ?? "—",
    },
    {
      key: "plan_activo",
      label: "Plan activo",
      // Oculto por default en Pronim — sin suscripciones vigentes. El
      // usuario puede reactivarlo desde el selector "Columnas".
      visibleDefault: false,
      headerClassName: th,
      className: td,
      render: (c) => c.plan_activo ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
          {c.plan_activo}
        </span>
      ) : (
        <span className="text-xs text-gray-400 whitespace-nowrap">Sin suscripción</span>
      ),
    },
    {
      key: "origen",
      label: "Origen",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => <BadgeOrigen origen={c.origen} />,
    },
    {
      key: "tipo_servicio",
      label: "Tipo servicio",
      // Oculto por default en Pronim — no aplica al modelo compra/venta
      // de prendas. Reactivable desde "Columnas".
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-xs text-gray-600 whitespace-nowrap`,
      render: (c) => etiquetaVisibleTipoServicio(c.tipo_servicio_cliente ?? null, mapNombreTipo),
    },
    {
      key: "estado",
      label: "Estado",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => <BadgeEstado estado={c.estado} />,
    },
    {
      key: "desde",
      label: "Desde",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-xs text-gray-400 whitespace-nowrap`,
      render: (c) => formatFecha(c.created_at),
    },
    {
      key: "creado_por",
      label: "Creado por",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-xs text-gray-500 whitespace-nowrap`,
      render: (c) => c.created_by_nombre ?? "—",
    },
    {
      key: "ruc_documento",
      label: "RUC / documento",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-sm text-gray-600 whitespace-nowrap`,
      render: documentoCliente,
    },
    {
      key: "email",
      label: "Email",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-sm text-gray-600 whitespace-nowrap`,
      render: (c) => c.email ?? "—",
    },
    {
      key: "vendedor_responsable",
      label: "Vendedor responsable",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-xs text-gray-500 whitespace-nowrap`,
      render: (c) => <VendedorResponsableCell cliente={c} />,
    },
    {
      key: "ultima_compra",
      label: "Última compra",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-xs whitespace-nowrap`,
      render: (c) => {
        const d = diasDesde(c.ultima_venta_at ?? null);
        if (d == null) return <span className="text-slate-400">Nunca</span>;
        const tone = d <= 30 ? "text-emerald-700" : d <= 90 ? "text-slate-700" : "text-rose-600";
        const label = d === 0 ? "Hoy" : d === 1 ? "Ayer" : `hace ${d}d`;
        return (
          <div className={tone}>
            <p className="font-medium">{label}</p>
            <p className="text-[10px] text-slate-400">{formatFecha(c.ultima_venta_at ?? "")}</p>
          </div>
        );
      },
    },
    {
      key: "total_comprado",
      label: "Total comprado",
      visibleDefault: true,
      headerClassName: `${th} text-right`,
      className: `${td} text-right text-sm font-semibold text-slate-800 tabular-nums whitespace-nowrap`,
      render: (c) => c.total_comprado != null ? fmtMoney(c.total_comprado) : <span className="text-slate-400">—</span>,
    },
    {
      key: "cantidad_compras",
      label: "Compras",
      visibleDefault: false,
      headerClassName: `${th} text-right`,
      className: `${td} text-right text-sm text-slate-700 tabular-nums whitespace-nowrap`,
      render: (c) => c.cantidad_compras ?? 0,
    },
    {
      key: "credito_disponible",
      label: "Crédito disponible",
      visibleDefault: false,
      headerClassName: `${th} text-right`,
      className: `${td} text-right text-sm tabular-nums whitespace-nowrap`,
      render: (c) => {
        const v = Number(c.credito_disponible ?? 0);
        if (v <= 0) return <span className="text-slate-400">—</span>;
        return <span className="font-semibold text-emerald-700">{fmtMoney(v)}</span>;
      },
    },
  ];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClientesPage() {
  const searchParams = useSearchParams();
  const [clientes,    setClientes]    = useState<Cliente[]>([]);
  const [cargando,    setCargando]    = useState(true);
  const [busqueda,    setBusqueda]    = useState("");
  const [bajaOk,      setBajaOk]      = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"" | "activo" | "inactivo">("");
  const [filtroOrigen, setFiltroOrigen] = useState<"" | "CRM" | "VENTA" | "MANUAL">("");
  const [filtroTipo,   setFiltroTipo]   = useState<"" | "empresa" | "persona">("");
  const [filtroTipoServicio, setFiltroTipoServicio] = useState<"" | string>("");
  // Segmento rápido: nuevos (últimos 30d), dormidos (>90d sin volver), VIP,
  // con crédito, nunca compraron, esta semana.
  const [segmento, setSegmento] = useState<"" | "nuevos" | "dormidos" | "vip" | "con_credito" | "nunca" | "semana" | "sin_volver_60">("");
  // Umbrales configurables (fase 2 tanda 11). Se cargan de /api/categorias-clientes
  // con defaults hardcoded para render inicial + fallback silencioso.
  const [umbrales, setUmbrales] = useState({
    dias_nuevo: 30, dias_semana: 7, dias_sin_volver: 60, dias_dormido: 90,
    vip_min_compras: 5, vip_top_pct: 15,
  });
  useEffect(() => {
    let cancel = false;
    fetch("/api/categorias-clientes", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        const c = j.data?.config;
        if (c) setUmbrales((prev) => ({ ...prev, ...c }));
      })
      .catch(() => { /* silencioso */ });
    return () => { cancel = true; };
  }, []);
  // Fase 2 tanda 14: segmentos guardados (localStorage). Un segmento es un
  // snapshot de los filtros actuales con nombre. Aparece como chip extra.
  type SegmentoGuardado = {
    id: string; nombre: string;
    busqueda: string; filtroEstado: string; filtroOrigen: string;
    filtroTipo: string; filtroTipoServicio: string;
    segmentoQuickKey: string;
  };
  const SEG_STORAGE = "neura.erp.clientes.segmentos.v1";
  const [segmentosGuardados, setSegmentosGuardados] = useState<SegmentoGuardado[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SEG_STORAGE);
      if (raw) setSegmentosGuardados(JSON.parse(raw) as SegmentoGuardado[]);
    } catch { /* ignore */ }
  }, []);
  function persistSegmentos(next: SegmentoGuardado[]) {
    setSegmentosGuardados(next);
    try { window.localStorage.setItem(SEG_STORAGE, JSON.stringify(next)); } catch { /* ignore */ }
  }
  const [modalGuardarOpen, setModalGuardarOpen] = useState(false);
  function guardarSegmentoActual() { setModalGuardarOpen(true); }
  function confirmarGuardarSegmento(nombre: string) {
    if (!nombre.trim()) { setModalGuardarOpen(false); return; }
    const item: SegmentoGuardado = {
      id: `seg-${Date.now()}`, nombre: nombre.trim().slice(0, 40),
      busqueda, filtroEstado, filtroOrigen, filtroTipo, filtroTipoServicio,
      segmentoQuickKey: segmento,
    };
    persistSegmentos([...segmentosGuardados, item]);
    setModalGuardarOpen(false);
  }
  function aplicarSegmento(s: SegmentoGuardado) {
    setBusqueda(s.busqueda ?? "");
    setFiltroEstado((s.filtroEstado as "" | "activo" | "inactivo") ?? "");
    setFiltroOrigen((s.filtroOrigen as "" | "CRM" | "VENTA" | "MANUAL") ?? "");
    setFiltroTipo((s.filtroTipo as "" | "empresa" | "persona") ?? "");
    setFiltroTipoServicio(s.filtroTipoServicio ?? "");
    setSegmento((s.segmentoQuickKey as typeof segmento) ?? "");
  }
  function borrarSegmento(id: string) {
    persistSegmentos(segmentosGuardados.filter((s) => s.id !== id));
  }

  // Fase 2 tanda 3: ordenamiento por columna. Click en header alterna
  // asc/desc; segundo click sobre la misma columna invierte, tercero limpia.
  type SortKey = ClienteColumnKey;
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleSort(key: SortKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir("desc"); return; }
    if (sortDir === "desc") { setSortDir("asc"); return; }
    setSortKey(null); setSortDir("desc");
  }
  const [columnasOpen, setColumnasOpen] = useState(false);
  const [columnasInicializadas, setColumnasInicializadas] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<ClienteColumnKey[]>(DEFAULT_VISIBLE_COLUMN_KEYS);
  const [filasTipoCatalogo, setFilasTipoCatalogo] = useState<ClienteTipoServicioRow[]>(() => filasTiposDesdeSistemaEstatico());
  const mapNombreTipo = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of filasTipoCatalogo) m[t.slug] = t.nombre;
    return m;
  }, [filasTipoCatalogo]);
  const { moneda } = useUserCfg();
  const money = useMoney();
  const fmtMoney = (n: number) => money.format(n || 0);
  const esSucursalBR = moneda === "BRL";
  const clienteColumns = useMemo(() => {
    const cols = buildClienteColumns(mapNombreTipo, fmtMoney);
    // Sucursales BR (Betim, BH, El Dorado): ocultar columnas que no aplican al
    // modelo de compra/venta de prendas — ni siquiera aparecen en el selector.
    if (esSucursalBR) {
      return cols.filter((c) => c.key !== "plan_activo" && c.key !== "tipo_servicio");
    }
    return cols;
    // fmtMoney depende de money.format que a su vez depende de moneda; con
    // esSucursalBR ya cubrimos el cambio de identidad. No hace falta más deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapNombreTipo, esSucursalBR]);
  const visibleColumnSet = useMemo(() => new Set(visibleColumnKeys), [visibleColumnKeys]);
  const visibleColumns = useMemo(
    () => clienteColumns.filter((col) => visibleColumnSet.has(col.key)),
    [clienteColumns, visibleColumnSet]
  );

  useEffect(() => {
    getClientes({ incluirPlanActivo: true }).then((data) => {
      setClientes(data);
      setCargando(false);
    });
  }, []);

  useEffect(() => {
    void fetchTiposFormCliente().then(setFilasTipoCatalogo);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLIENTES_COLUMNAS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      setVisibleColumnKeys(normalizeVisibleColumnKeys(parsed, clienteColumns));
    } catch {
      setVisibleColumnKeys([...DEFAULT_VISIBLE_COLUMN_KEYS]);
    } finally {
      setColumnasInicializadas(true);
    }
  }, [clienteColumns]);

  useEffect(() => {
    if (!columnasInicializadas) return;
    try {
      window.localStorage.setItem(CLIENTES_COLUMNAS_STORAGE_KEY, JSON.stringify(visibleColumnKeys));
    } catch {
      /* localStorage puede fallar en modo privado; los defaults siguen funcionando. */
    }
  }, [visibleColumnKeys, columnasInicializadas]);

  const slugsExtraFiltro = useMemo(() => {
    const known = new Set(filasTipoCatalogo.map((f) => f.slug));
    const u = new Set<string>();
    for (const c of clientes) {
      const t = (c.tipo_servicio_cliente ?? "").trim();
      if (t && !known.has(t)) u.add(t);
    }
    return Array.from(u).sort();
  }, [clientes, filasTipoCatalogo]);

  useEffect(() => {
    if (searchParams?.get("baja_ok") === "1") {
      setBajaOk(true);
      window.history.replaceState({}, "", "/clientes");
      const t = setTimeout(() => setBajaOk(false), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // Pre-aplicar filtros desde querystring (drill desde dashboard).
  // Ejemplos: /clientes?segmento=vip · ?estado=inactivo · ?q=Betim
  useEffect(() => {
    if (!searchParams) return;
    const seg = searchParams.get("segmento");
    if (seg && ["nuevos","dormidos","vip","con_credito","nunca","semana","sin_volver_60"].includes(seg)) {
      setSegmento(seg as typeof segmento);
    }
    const est = searchParams.get("estado");
    if (est === "activo" || est === "inactivo") setFiltroEstado(est);
    const ori = searchParams.get("origen");
    if (ori === "CRM" || ori === "VENTA" || ori === "MANUAL") setFiltroOrigen(ori);
    const tipo = searchParams.get("tipo");
    if (tipo === "empresa" || tipo === "persona") setFiltroTipo(tipo);
    const q = searchParams.get("q");
    if (q) setBusqueda(q);
    // Solo en primer render — el usuario luego puede cambiarlos sin que se
    // sobreescriban.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Umbral VIP relativo: top 15% del total comprado. Se recalcula cuando
  // cambia el universo de clientes cargado.
  const vipUmbralTotal = useMemo(() => {
    const totales = clientes
      .map((c) => Number(c.total_comprado ?? 0))
      .filter((n) => n > 0)
      .sort((a, b) => b - a);
    if (totales.length === 0) return Infinity;
    const pct = Math.max(1, Math.min(100, umbrales.vip_top_pct)) / 100;
    const idx = Math.max(0, Math.floor(totales.length * pct) - 1);
    return totales[idx] ?? totales[0];
  }, [clientes, umbrales.vip_top_pct]);

  const filtrados = clientes.filter((c) => {
    const nombre = clienteNombre(c).toLowerCase();
    const q      = busqueda.toLowerCase();
    if (q) {
      const match =
        nombre.includes(q) ||
        (c.codigo_cliente ?? "").toLowerCase().includes(q) ||
        (c.email          ?? "").toLowerCase().includes(q) ||
        (c.telefono       ?? "").toLowerCase().includes(q) ||
        (c.ruc            ?? "").toLowerCase().includes(q) ||
        (c.ciudad         ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filtroEstado       && c.estado              !== filtroEstado) return false;
    if (filtroOrigen       && c.origen              !== filtroOrigen) return false;
    if (filtroTipo         && c.tipo_cliente        !== filtroTipo) return false;
    if (filtroTipoServicio && c.tipo_servicio_cliente !== filtroTipoServicio) return false;
    if (segmento) {
      const d = diasDesde(c.ultima_venta_at ?? null);
      const compras = c.cantidad_compras ?? 0;
      const total = c.total_comprado ?? 0;
      const cred = c.credito_disponible ?? 0;
      const diasDesdeAlta = diasDesde(c.created_at);
      switch (segmento) {
        case "nuevos":
          if ((diasDesdeAlta ?? 9999) > umbrales.dias_nuevo) return false;
          break;
        case "dormidos":
          if (d == null || d < umbrales.dias_dormido) return false;
          break;
        case "sin_volver_60":
          if (d == null || d < umbrales.dias_sin_volver) return false;
          break;
        case "vip":
          if (compras < umbrales.vip_min_compras && total < vipUmbralTotal) return false;
          break;
        case "con_credito":
          if (cred <= 0) return false;
          break;
        case "nunca":
          if (compras > 0) return false;
          break;
        case "semana":
          if (d == null || d > umbrales.dias_semana) return false;
          break;
      }
    }
    return true;
  });

  const hayFiltros = busqueda || filtroEstado || filtroOrigen || filtroTipo || filtroTipoServicio || segmento;

  // Aplicar sort si hay columna elegida. Usamos comparadores tipados por
  // columna — así ordenar por "total_comprado" es numérico y no lexicográfico.
  const filtradosOrdenados = useMemo(() => {
    if (!sortKey) return filtrados;
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtrados];
    const cmp = (a: Cliente, b: Cliente): number => {
      switch (sortKey) {
        case "empresa_nombre": return clienteNombre(a).localeCompare(clienteNombre(b), "es") * dir;
        case "codigo":         return (a.codigo_cliente ?? "").localeCompare(b.codigo_cliente ?? "", "es") * dir;
        case "contacto":       return ((a.nombre_contacto ?? a.ciudad ?? "") as string).localeCompare((b.nombre_contacto ?? b.ciudad ?? "") as string, "es") * dir;
        case "telefono":       return ((a.telefono ?? "") as string).localeCompare((b.telefono ?? "") as string) * dir;
        case "email":          return ((a.email ?? "") as string).localeCompare((b.email ?? "") as string) * dir;
        case "estado":         return (a.estado ?? "").localeCompare(b.estado ?? "") * dir;
        case "origen":         return (a.origen ?? "").localeCompare(b.origen ?? "") * dir;
        case "desde":          return (Date.parse(a.created_at) - Date.parse(b.created_at)) * dir;
        case "ultima_compra":  return ((Date.parse(a.ultima_venta_at ?? "") || 0) - (Date.parse(b.ultima_venta_at ?? "") || 0)) * dir;
        case "total_comprado": return ((a.total_comprado ?? 0) - (b.total_comprado ?? 0)) * dir;
        case "cantidad_compras": return ((a.cantidad_compras ?? 0) - (b.cantidad_compras ?? 0)) * dir;
        case "credito_disponible": return ((a.credito_disponible ?? 0) - (b.credito_disponible ?? 0)) * dir;
        default: return 0;
      }
    };
    return arr.sort(cmp);
  }, [filtrados, sortKey, sortDir]);

  function toggleColumn(key: ClienteColumnKey) {
    const col = clienteColumns.find((c) => c.key === key);
    if (!col || col.required) return;
    setVisibleColumnKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  }

  function resetColumnas() {
    setVisibleColumnKeys([...DEFAULT_VISIBLE_COLUMN_KEYS]);
  }

  // Fase 2 tanda 14: reordenar columnas (↑ / ↓). Solo mueve entre visibles.
  function moverColumna(key: ClienteColumnKey, direccion: "arriba" | "abajo") {
    setVisibleColumnKeys((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const nueva = [...prev];
      const target = direccion === "arriba" ? idx - 1 : idx + 1;
      if (target < 0 || target >= nueva.length) return prev;
      [nueva[idx], nueva[target]] = [nueva[target], nueva[idx]];
      return nueva;
    });
  }

  return (
    <div className="space-y-6">

      {/* Mensaje de éxito baja operativa */}
      {bajaOk && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800">
          <span className="text-xl">✓</span>
          <p className="text-sm font-medium">Baja procesada correctamente</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
              style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Zentra · Base
            </p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Clientes</h1>
          <p className="mt-0.5 text-xs text-slate-500">Base de clientes activos de la empresa</p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Nuevo cliente
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre, código, email, RUC..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none transition-all"
        />
        <FancySelect
          value={filtroEstado}
          onChange={(v) => setFiltroEstado(v as "" | "activo" | "inactivo")}
          ariaLabel="Filtrar por estado"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Todos los estados" },
            { value: "activo", label: "Activo" },
            { value: "inactivo", label: "Inactivo" },
          ]}
        />
        <FancySelect
          value={filtroTipo}
          onChange={(v) => setFiltroTipo(v as "" | "empresa" | "persona")}
          ariaLabel="Filtrar por tipo"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Todos los tipos" },
            { value: "empresa", label: "Empresa" },
            { value: "persona", label: "Persona" },
          ]}
        />
        <FancySelect
          value={filtroOrigen}
          onChange={(v) => setFiltroOrigen(v as "" | "CRM" | "VENTA" | "MANUAL")}
          ariaLabel="Filtrar por origen"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Todos los orígenes" },
            { value: "CRM", label: "CRM" },
            { value: "VENTA", label: "Venta" },
            { value: "MANUAL", label: "Manual" },
          ]}
        />
        <FancySelect
          value={filtroTipoServicio}
          onChange={(v) => setFiltroTipoServicio(v)}
          ariaLabel="Filtrar por tipo de servicio"
          className="w-44"
          size="sm"
          options={[
            { value: "", label: "Tipo servicio" },
            ...filasTipoCatalogo.map((t) => ({ value: t.slug, label: t.nombre })),
            ...slugsExtraFiltro.map((slug) => ({
              value: slug,
              label: etiquetaVisibleTipoServicio(slug, mapNombreTipo),
            })),
          ]}
        />
        {hayFiltros && (
          <button
            onClick={() => { setBusqueda(""); setFiltroEstado(""); setFiltroOrigen(""); setFiltroTipo(""); setFiltroTipoServicio(""); setSegmento(""); }}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      <ModalGuardarSegmento
        open={modalGuardarOpen}
        onConfirm={confirmarGuardarSegmento}
        onCancel={() => setModalGuardarOpen(false)}
      />

      {/* Fila única: chips rápidos + guardados + botón guardar */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {([
          ["", "Todos", clientes.length],
          ["nuevos", `Nuevos (${umbrales.dias_nuevo}d)`, clientes.filter((c) => (diasDesde(c.created_at) ?? 9999) <= umbrales.dias_nuevo).length],
          ["semana", `Compró últimos ${umbrales.dias_semana}d`, clientes.filter((c) => { const d = diasDesde(c.ultima_venta_at ?? null); return d != null && d <= umbrales.dias_semana; }).length],
          ["vip", "VIP", clientes.filter((c) => (c.cantidad_compras ?? 0) >= umbrales.vip_min_compras || (c.total_comprado ?? 0) >= vipUmbralTotal).length],
          ["con_credito", "Con crédito", clientes.filter((c) => (c.credito_disponible ?? 0) > 0).length],
          ["sin_volver_60", `Sin volver +${umbrales.dias_sin_volver}d`, clientes.filter((c) => { const d = diasDesde(c.ultima_venta_at ?? null); return d != null && d >= umbrales.dias_sin_volver; }).length],
          ["dormidos", `Dormidos +${umbrales.dias_dormido}d`, clientes.filter((c) => { const d = diasDesde(c.ultima_venta_at ?? null); return d != null && d >= umbrales.dias_dormido; }).length],
          ["nunca", "Nunca compraron", clientes.filter((c) => (c.cantidad_compras ?? 0) === 0).length],
        ] as const).map(([key, label, count]) => {
          const active = segmento === key;
          return (
            <button
              key={key || "todos"}
              type="button"
              onClick={() => setSegmento(key as typeof segmento)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                active
                  ? "bg-[#4FAEB2] border-[#4FAEB2] text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-[#4FAEB2] hover:text-[#3F8E91]"
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Separador + guardados inline */}
        {segmentosGuardados.length > 0 && (
          <>
            <span aria-hidden className="mx-1 h-5 w-px bg-slate-200" />
            {segmentosGuardados.map((s) => (
              <div key={s.id} className="inline-flex items-center rounded-full border border-[#4FAEB2]/50 bg-gradient-to-r from-[#4FAEB2]/10 to-[#4FAEB2]/5 pl-2.5 pr-1 py-1 text-xs shadow-sm">
                <button type="button" onClick={() => aplicarSegmento(s)}
                  className="inline-flex items-center gap-1 text-[#3F8E91] hover:text-[#2A6668] font-semibold mr-1"
                  title="Aplicar este segmento">
                  <span className="text-amber-500 text-xs">★</span> {s.nombre}
                </button>
                <button type="button" onClick={() => borrarSegmento(s.id)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500 transition"
                  title="Borrar segmento">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>
            ))}
          </>
        )}

        {/* Guardar filtro — icono al final derecho */}
        {hayFiltros && (
          <button type="button" onClick={guardarSegmentoActual}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 hover:border-[#4FAEB2] hover:text-[#3F8E91] hover:bg-[#4FAEB2]/5 transition"
            title="Guardar esta combinación de filtros">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 7.36 0 3 3 0 0 1 2.82 2.995v11.856a.75.75 0 0 1-1.212.59L10 14.187l-5.288 3.83A.75.75 0 0 1 3.5 17.428V5.572a3 3 0 0 1 2.82-2.995Z" clipRule="evenodd" />
            </svg>
            Guardar filtro
          </button>
        )}
      </div>

      {/* Contador */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{filtradosOrdenados.length}</span> de{" "}
          <span className="font-semibold text-gray-800">{clientes.length}</span> clientes
        </p>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex gap-3 text-xs text-gray-400">
            <span>{clientes.filter((c) => c.estado === "activo").length} activos</span>
            <span>·</span>
            <span>{clientes.filter((c) => c.tipo_cliente === "empresa").length} empresas</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnasOpen((v) => !v)}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium shadow-sm transition-colors"
              aria-expanded={columnasOpen}
            >
              <span>Columnas</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {visibleColumns.length}/{clienteColumns.length}
              </span>
            </button>
            {columnasOpen && (() => {
              const visKeys = visibleColumnKeys.filter((k) => clienteColumns.find((c) => c.key === k));
              const ocultas = clienteColumns.filter((c) => !visibleColumnSet.has(c.key));
              const colByKey = new Map(clienteColumns.map((c) => [c.key, c]));
              return (
                <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="p-4 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800">Personalizar columnas</p>
                    <p className="text-xs text-slate-500 mt-1">Reordená con las flechas · Quitá con la X · Agregá tildando abajo.</p>
                  </div>

                  {/* Visibles (con reorden) */}
                  <div className="p-2 max-h-64 overflow-y-auto border-b border-slate-100">
                    <p className="px-2 py-1 text-[10px] uppercase font-semibold tracking-wide text-slate-400">Visibles ({visKeys.length})</p>
                    {visKeys.map((k, idx) => {
                      const col = colByKey.get(k);
                      if (!col) return null;
                      return (
                        <div key={k} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                          <span className="flex-1 text-sm text-slate-700">{col.label}</span>
                          <button type="button" disabled={idx === 0}
                            onClick={() => moverColumna(k, "arriba")}
                            className="p-1 text-slate-400 hover:text-[#3F8E91] disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Subir">▲</button>
                          <button type="button" disabled={idx === visKeys.length - 1}
                            onClick={() => moverColumna(k, "abajo")}
                            className="p-1 text-slate-400 hover:text-[#3F8E91] disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Bajar">▼</button>
                          <button type="button" disabled={col.required}
                            onClick={() => toggleColumn(k)}
                            className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={col.required ? "Requerida" : "Ocultar"}>✕</button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Ocultas (para agregar) */}
                  {ocultas.length > 0 && (
                    <div className="p-2 max-h-40 overflow-y-auto border-b border-slate-100">
                      <p className="px-2 py-1 text-[10px] uppercase font-semibold tracking-wide text-slate-400">Ocultas ({ocultas.length})</p>
                      {ocultas.map((col) => (
                        <button key={col.key} type="button" onClick={() => toggleColumn(col.key)}
                          className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                          <span className="text-slate-400 text-xs">＋</span>{col.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 p-3">
                    <p className="text-[11px] text-slate-400">Se guarda por usuario en este navegador.</p>
                    <button type="button" onClick={resetColumnas}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900">Restablecer</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm ring-1 ring-[#4FAEB2]/15">
        {cargando ? (
          <div className="py-16 text-center text-sm text-slate-400">
            <div className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin text-[#4FAEB2]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Cargando clientes…
            </div>
          </div>
        ) : filtradosOrdenados.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-medium text-gray-600">
              {clientes.length === 0 ? "No hay clientes registrados" : "Sin resultados para los filtros aplicados"}
            </p>
            {clientes.length === 0 && (
              <Link href="/clientes/nuevo" className="mt-4 inline-block text-sm text-gray-500 underline hover:text-gray-800">
                Crear primer cliente
              </Link>
            )}
          </div>
        ) : /* tabla */ (
          <EdgeScrollArea>
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {visibleColumns.map((col) => {
                    const active = sortKey === col.key;
                    const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
                    return (
                      <th
                        key={col.key}
                        className={`${col.headerClassName} cursor-pointer select-none hover:text-[#3F8E91]`}
                        onClick={() => toggleSort(col.key)}
                        title="Ordenar"
                      >
                        {col.label}
                        {arrow && <span className="ml-1 text-[10px] text-[#4FAEB2]">{arrow}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtradosOrdenados.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-200 hover:bg-[#4FAEB2]/[0.04] transition-colors cursor-pointer group"
                    onClick={() => window.location.href = `/clientes/${c.id}`}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={col.className}>
                        {col.render(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </EdgeScrollArea>
        )}
      </div>

      <MobileFab href="/clientes/nuevo" label="Nuevo cliente" />
    </div>
  );
}
