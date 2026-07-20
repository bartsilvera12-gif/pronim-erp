"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { signOut } from "@/lib/auth";

type HeaderUsuario = {
  nombre: string | null;
  rol: string | null;
  email: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function roleLabel(rol: string | null | undefined): string {
  const r = clean(rol).toLowerCase();
  const labels: Record<string, string> = {
    admin: "Admin",
    administrador: "Admin",
    super_admin: "Admin",
    supervisor: "Supervisor",
    vendedor: "Vendedor",
    asesor: "Asesor",
    comercial: "Comercial",
    "asesor comercial": "Asesor comercial",
    usuario: "Usuario",
  };
  if (labels[r]) return labels[r];
  if (!r) return "Usuario";
  return r
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type HeaderProps = {
  onOpenMobileSidebar?: () => void;
};

type NotifRecep = {
  id: string;
  numero_control: string | null;
  cliente_id: string | null;
  fecha: string;
};

type NotifMeta = {
  sucursal_id: string;
  nombre: string;
  pct_meta: number;
  vendido: number;
  meta_periodo: number;
};


export default function Header({ onOpenMobileSidebar }: HeaderProps = {}) {
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [usuario, setUsuario] = useState<HeaderUsuario | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Notificaciones — recepciones pendientes de evaluar/ingresar.
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifPend, setNotifPend] = useState<NotifRecep[]>([]);
  const [notifClientes, setNotifClientes] = useState<Record<string, string>>({});
  const notifRef = useRef<HTMLDivElement>(null);
  // Notificaciones — metas alcanzadas. Se muestran en el popover del bell.
  // El sticky note celebratorio + sonido viven en /atencion/nueva (caja).
  const [notifMetas, setNotifMetas] = useState<NotifMeta[]>([]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadUsuario() {
      try {
        const res = await fetchWithSupabaseSession("/api/usuarios/me", { cache: "no-store" });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = (await res.json()) as { usuario?: HeaderUsuario };
        if (alive) setUsuario(json.usuario ?? null);
      } catch {
        if (alive) setUsuario(null);
      }
    }
    void loadUsuario();
    return () => {
      alive = false;
    };
  }, []);

  // Cargar notificaciones (recepciones pendientes) al montar + refrescar
  // cada 60s. El endpoint ya filtra por sucursal del usuario si tiene fija.
  useEffect(() => {
    let alive = true;
    async function loadNotif() {
      try {
        const r = await fetchWithSupabaseSession("/api/recepciones/pendientes", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!alive || !j?.success) return;
        setNotifPend((j.data?.recepciones as NotifRecep[]) ?? []);
        setNotifClientes((j.data?.clientes as Record<string, string>) ?? {});
      } catch { /* silencioso */ }
    }
    void loadNotif();
    const t = setInterval(loadNotif, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Cargar metas alcanzadas al montar + refrescar cada 2 min (solo para el bell).
  useEffect(() => {
    let alive = true;
    async function loadMetas() {
      try {
        const r = await fetchWithSupabaseSession("/api/notificaciones/metas", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!alive || !j?.success) return;
        setNotifMetas((j.data?.metas as NotifMeta[]) ?? []);
      } catch { /* silencioso */ }
    }
    void loadMetas();
    const t = setInterval(loadMetas, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Cerrar popover de notificaciones al hacer click afuera.
  useEffect(() => {
    if (!notifOpen) return;
    function onDown(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  const nombreReal = clean(usuario?.nombre);
  const fallbackEmail = clean(usuario?.email);
  const displayName = nombreReal || fallbackEmail || "Usuario";
  const dropdownName = nombreReal || "Usuario";
  const avatarInitial = (nombreReal || fallbackEmail || "Usuario").charAt(0).toUpperCase();
  const displayRole = roleLabel(usuario?.rol);

  // Total combinado (recepciones pendientes + metas alcanzadas) para el
  // badge del bell. Las metas destacan en verde; los pendientes en ámbar.
  const totalNotif = notifPend.length + notifMetas.length;
  const badgeTone = notifMetas.length > 0
    ? "bg-emerald-500"
    : notifPend.length > 0 ? "bg-amber-500" : "bg-[#4FAEB2]";
  const bellTone = notifMetas.length > 0
    ? "text-emerald-600 hover:text-emerald-700"
    : notifPend.length > 0 ? "text-amber-600 hover:text-amber-700" : "text-[#475569] hover:text-[#4FAEB2]";

  return (
    <header
      id="neura-header"
      className="z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white/95 px-3 sm:px-6 shadow-[inset_0_-1px_0_0_rgba(10,37,64,0.05)] backdrop-blur-sm"
    >
      {/* Hamburguesa: solo mobile. Abre el sidebar como sheet desde la izquierda. */}
      <button
        type="button"
        onClick={() => onOpenMobileSidebar?.()}
        aria-label="Abrir menú"
        className="-ml-1 flex h-11 w-11 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#4FAEB2] md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {/* Spacer en desktop para mantener el justify-end original. */}
      <span className="hidden md:block" />

      <div className="flex items-center gap-2">
        {/* Asistente de ayuda (Neurita) — desactivado temporalmente. */}

        {/* Notificaciones — hoy solo muestran recepciones pendientes de
            evaluar/ingresar al stock. Refresca cada 60s. */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen(v => !v)}
            className={`relative rounded-lg p-2 transition-colors hover:bg-slate-50 ${bellTone}`}
            aria-label="Notificaciones"
          >
            <Bell className="h-5 w-5" />
            <span className={`absolute -right-0.5 -top-0.5 flex min-w-4 h-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${badgeTone}`}>
              {totalNotif > 99 ? "99+" : totalNotif}
            </span>
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800">Notificaciones</h4>
                {totalNotif > 0 && (
                  <span className="text-[11px] text-slate-500 font-semibold">{totalNotif} nuevas</span>
                )}
              </div>

              {/* ═════ Metas alcanzadas — sticky note verde adentro del bell ═════ */}
              {notifMetas.map(m => (
                <div key={m.sucursal_id} className="mx-3 mt-3 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 border border-emerald-300 shadow-sm p-3 -rotate-1">
                  <div className="flex items-start gap-2">
                    <span className="text-2xl leading-none">🎉</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-emerald-900">¡Felicidades!</p>
                      <p className="text-xs text-emerald-800 mt-0.5 leading-tight">
                        <strong>{m.nombre}</strong> alcanzó el <strong>{m.pct_meta}%</strong> de la meta del día.
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {notifPend.length === 0 && notifMetas.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">Todo al día, sin pendientes.</p>
              ) : notifPend.length === 0 ? (
                <div className="px-4 py-4 text-center text-xs text-slate-400">Sin pendientes de evaluar.</div>
              ) : (
                <>
                  <div className="px-4 py-3 bg-amber-50/50 border-b border-amber-100">
                    <div className="flex items-start gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0 text-amber-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008ZM12 4c-4 5-6 8-6 11a6 6 0 0 0 12 0c0-3-2-6-6-11Z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-900">
                          {notifPend.length === 1
                            ? "1 recepción pendiente de evaluar"
                            : `${notifPend.length} recepciones pendientes de evaluar`}
                        </p>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          Ropas del cliente que aún no fueron ingresadas al stock.
                        </p>
                      </div>
                    </div>
                  </div>
                  <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {notifPend.slice(0, 8).map(n => {
                      const cliente = (n.cliente_id && notifClientes[n.cliente_id]) || "(sin cliente)";
                      const horas = Math.max(0, Math.floor((Date.now() - new Date(n.fecha).getTime()) / (3600 * 1000)));
                      const dias = Math.floor(horas / 24);
                      const cuantoHace = dias >= 1 ? `hace ${dias}d` : `hace ${horas}h`;
                      const vencida = horas > 72;
                      return (
                        <li key={n.id} className="px-4 py-2 hover:bg-slate-50">
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${vencida ? "bg-rose-500" : "bg-amber-500"}`} />
                            <span className="font-mono text-[10px] text-slate-500 shrink-0">{n.numero_control ?? "—"}</span>
                            <span className="flex-1 truncate text-slate-700">{cliente}</span>
                            <span className={`text-[10px] font-semibold shrink-0 ${vencida ? "text-rose-700" : "text-slate-500"}`}>{cuantoHace}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {notifPend.length > 8 && (
                    <p className="px-4 py-1.5 text-center text-[10px] text-slate-400">
                      +{notifPend.length - 8} más
                    </p>
                  )}
                  <Link
                    href="/atencion/pendientes-ingreso"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-center justify-center gap-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold border-t border-amber-700"
                  >
                    Ir a la bandeja de pendientes →
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        {/* Avatar + menú usuario */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--zentra-sidebar)] text-white ring-1 ring-sky-400/35">
              <span className="text-sm font-bold">{avatarInitial}</span>
            </div>
            <div className="hidden text-left sm:block">
              <p className="max-w-[180px] truncate text-sm font-medium text-[#0F172A]">{displayName}</p>
              <p className="text-xs text-[#475569]">{displayRole}</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          <div
            className={`absolute right-0 top-full mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
              userMenuOpen ? "block" : "hidden"
            }`}
          >
            <div className="border-b border-slate-200 px-4 py-2">
              <p className="truncate text-sm font-medium text-[#0F172A]">{dropdownName}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#4FAEB2]"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
