"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useParams, useSearchParams } from "next/navigation";
import { useAutoClearFlag } from "@/hooks/useAutoClearFlag";
import {
  SectionCard,
  emptyUsuarioForm,
  nivelFromRolDb,
  rolFromNivelForm,
  usuarioFormInputGray,
  usuarioFormLabel,
  UsuarioFormFields,
  type SucursalOpt,
  type UsuarioFormValues,
} from "@/components/usuarios/UsuarioForm";
import { useSucursales } from "@/components/usuarios/useSucursales";
import type { AreaUsuario, TipoContrato } from "@/lib/usuarios/types";

type ModuloOpt = { id: string; nombre: string; slug: string };

type Usuario = {
  id: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  fecha_nacimiento: string | null;
  fecha_ingreso?: string | null;
  tipo_contrato?: string | null;
  salario_base?: number | null;
  porcentaje_comision?: number | null;
  ips?: boolean | null;
  area?: string | null;
  rol: string | null;
  estado: string | null;
  created_at: string;
  sucursal_id?: string | null;
  modulo_ids?: string[];
  modulos_empresa?: ModuloOpt[];
  dashboard_views_empresa?: { id: string; nombre: string; slug: string; orden: number }[];
  dashboard_view_ids?: string[];
  default_dashboard_view_id?: string | null;
  puede_editar_modulos?: boolean;
  puede_editar_rol?: boolean;
  es_admin_empresa?: boolean;
  omnicanal?: {
    agent_enabled: boolean;
    work_schedule_id: string | null;
    schedules: {
      id: string;
      nombre: string;
      time_start: string;
      time_end: string;
      days_of_week: number[];
      is_active: boolean;
    }[];
  } | null;
};

function labelTipoContrato(t: string | null | undefined): string {
  const m: Record<string, string> = {
    salario: "Salario fijo",
    comision: "Comisión",
    mixto: "Mixto (salario + comisión)",
    prestador_servicio: "Prestador de servicio",
  };
  const k = (t ?? "").trim().toLowerCase();
  return k ? (m[k] ?? k) : "—";
}

function labelArea(a: string | null | undefined): string {
  const m: Record<string, string> = {
    ventas: "Ventas",
    soporte: "Soporte",
    finanzas: "Finanzas",
    operaciones: "Operaciones",
    administracion: "Administración",
  };
  const k = (a ?? "").trim().toLowerCase();
  return k ? (m[k] ?? k) : "—";
}

function fmtGs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("es-PY");
}

function labelNivelDisplay(rol: string | null): string {
  const n = nivelFromRolDb(rol);
  const m: Record<string, string> = {
    usuario: "Usuario",
    supervisor: "Supervisor",
    administrador: "Administrador",
  };
  return m[n] ?? n;
}

function usuarioToForm(u: Usuario): UsuarioFormValues {
  const tipo = (u.tipo_contrato ?? "salario").trim().toLowerCase();
  const tipoContrato = (
    ["salario", "comision", "mixto", "prestador_servicio"].includes(tipo) ? tipo : "salario"
  ) as TipoContrato;
  const areaRaw = (u.area ?? "ventas").trim().toLowerCase();
  const area = (
    ["ventas", "soporte", "finanzas", "operaciones", "administracion"].includes(areaRaw)
      ? areaRaw
      : "ventas"
  ) as AreaUsuario;

  return {
    ...emptyUsuarioForm(),
    nombre: u.nombre ?? "",
    email: u.email ?? "",
    telefono: u.telefono ?? "",
    fecha_nacimiento: u.fecha_nacimiento ? u.fecha_nacimiento.slice(0, 10) : "",
    fecha_ingreso: u.fecha_ingreso ? String(u.fecha_ingreso).slice(0, 10) : "",
    tipo_contrato: tipoContrato,
    salario_base: u.salario_base != null ? String(Math.round(Number(u.salario_base))) : "",
    porcentaje_comision:
      u.porcentaje_comision != null ? String(u.porcentaje_comision) : "",
    ips: Boolean(u.ips),
    nivel: nivelFromRolDb(u.rol),
    area,
    estado: (u.estado as "activo" | "inactivo") ?? "activo",
    password: "",
    password2: "",
    modulo_ids: u.modulo_ids ?? [],
    dashboard_view_ids: u.dashboard_view_ids ?? [],
    default_dashboard_view_id: u.default_dashboard_view_id ?? "",
    sucursal_id: u.sucursal_id ?? "",
  };
}

function UsuarioDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");
  const editMode = searchParams?.get("edit") === "1";

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [editing, setEditing] = useState(editMode);
  const [form, setForm] = useState<UsuarioFormValues>(() => emptyUsuarioForm());
  const [formError, setFormError] = useState<string | null>(null);
  // Auto-clear a 5s. Reemplaza setTimeout(() => setSuccessMessage(null), 5000) inseguro.
  const [successMessage, setSuccessMessage] = useAutoClearFlag<string>(5000);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [pwdNew, setPwdNew] = useState("");
  const [pwdNew2, setPwdNew2] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  // Auto-clear a 6s. Idem successMessage.
  const [pwdSuccess, setPwdSuccess] = useAutoClearFlag<string>(6000);

  const [omniAgent, setOmniAgent] = useState(false);
  const [omniScheduleId, setOmniScheduleId] = useState<string>("");
  /** Aviso no bloqueante cuando el guardado omnicanal no pudo usar el schema tenant (PostgREST). */
  const [omnicanalWarning, setOmnicanalWarning] = useState<string | null>(null);

  const {
    sucursales,
    error: sucursalesError,
    recargar: recargarSucursales,
  } = useSucursales();

  /**
   * La sucursal que el usuario ya tiene se ofrece como opción aunque el
   * catálogo activo no la traiga (sucursal desactivada): si no, el select
   * aparecía en blanco y al guardar se perdía la asignación.
   */
  const sucursalAsignadaId = usuario?.sucursal_id ?? null;
  const sucursalActualOpt: SucursalOpt | null = sucursalAsignadaId
    ? ((sucursales ?? []).find((s) => s.id === sucursalAsignadaId) ?? {
        id: sucursalAsignadaId,
        nombre: "Sucursal asignada (inactiva)",
        activo: false,
      })
    : null;

  useEffect(() => {
    if (!id) return;
    setLoadError(null);
    fetchWithSupabaseSession(`/api/empresas/usuarios/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
        return data;
      })
      .then((data) => {
        const u = data as Usuario;
        setOmnicanalWarning(null);
        setUsuario(u);
        setForm(usuarioToForm(u));
        if (u.omnicanal) {
          setOmniAgent(Boolean(u.omnicanal.agent_enabled));
          setOmniScheduleId(u.omnicanal.work_schedule_id ?? "");
        } else {
          setOmniAgent(false);
          setOmniScheduleId("");
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "No se pudo cargar el usuario");
      });
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    if (type === "checkbox" && name.startsWith("modulo_")) {
      const mid = (e.target as HTMLInputElement).value;
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev) => ({
        ...prev,
        modulo_ids: checked ? [...prev.modulo_ids, mid] : prev.modulo_ids.filter((m) => m !== mid),
      }));
      return;
    }
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
      return;
    }
    let normalized = value;
    if (name === "email" || type === "email") normalized = value.toLowerCase();
    else if (name === "nombre") normalized = value.toUpperCase();
    setForm((prev) => ({ ...prev, [name]: normalized } as UsuarioFormValues));
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    setFormError(null);
    setSuccessMessage(null);
    if (!form.nombre.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    if (!form.email.trim()) {
      setFormError("El email es obligatorio.");
      return;
    }

    const pct = form.porcentaje_comision.trim();
    const pctNum = pct === "" ? null : Number(pct);
    if (pctNum !== null && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) {
      setFormError("La comisión debe estar entre 0 y 100.");
      return;
    }

    // Sucursal obligatoria para no-admin (validación cliente; el servidor la re-valida).
    const nivelEfectivo = usuario.puede_editar_rol ? form.nivel : nivelFromRolDb(usuario.rol);
    if (nivelEfectivo !== "administrador" && !form.sucursal_id) {
      setFormError(
        sucursales !== undefined && sucursales.length === 0
          ? "La sucursal es obligatoria para usuarios y supervisores, y tu empresa todavía no tiene ninguna. Creá una en Administración → Sucursales."
          : "La sucursal es obligatoria para usuarios y supervisores."
      );
      return;
    }

    setGuardando(true);
    setOmnicanalWarning(null);
    try {
      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        email: form.email.trim().toLowerCase(),
        telefono: form.telefono.trim() || undefined,
        fecha_nacimiento: form.fecha_nacimiento || undefined,
        fecha_ingreso: form.fecha_ingreso || undefined,
        tipo_contrato: form.tipo_contrato,
        salario_base: form.salario_base.trim() || undefined,
        porcentaje_comision: pct.trim() || undefined,
        ips: form.ips,
        area: form.area,
        estado: form.estado,
      };
      // Solo mandamos `rol` si realmente cambió el nivel: así editar un dato
      // suelto de un super_admin no lo degrada a "administrador".
      if (usuario.puede_editar_rol && form.nivel !== nivelFromRolDb(usuario.rol)) {
        body.rol = rolFromNivelForm(form.nivel);
      }

      // sucursal_id siempre se envía: string vacío se normaliza a null en server.
      body.sucursal_id = form.sucursal_id || null;

      if (usuario.puede_editar_modulos && !usuario.es_admin_empresa) {
        body.modulo_ids = form.modulo_ids;
      }

      if (
        usuario.puede_editar_modulos &&
        !usuario.es_admin_empresa &&
        (usuario.dashboard_views_empresa?.length ?? 0) > 0
      ) {
        body.dashboard_view_ids = form.dashboard_view_ids;
        body.default_dashboard_view_id =
          form.default_dashboard_view_id.trim() &&
          form.dashboard_view_ids.includes(form.default_dashboard_view_id.trim())
            ? form.default_dashboard_view_id.trim()
            : form.dashboard_view_ids.length === 1
              ? form.dashboard_view_ids[0]
              : null;
      }

      if (usuario.puede_editar_modulos && usuario.omnicanal) {
        body.omnicanal_agent_enabled = omniAgent;
        body.omnicanal_work_schedule_id =
          omniAgent && omniScheduleId.trim() ? omniScheduleId.trim() : null;
      }

      const res = await fetchWithSupabaseSession(`/api/empresas/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        omnicanal_warning?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `Error al guardar (${res.status})`);
      }

      if (typeof json.omnicanal_warning === "string" && json.omnicanal_warning.trim()) {
        setOmnicanalWarning(json.omnicanal_warning.trim());
      }

      const rolActualizado =
        usuario.puede_editar_rol && form.nivel !== nivelFromRolDb(usuario.rol)
          ? rolFromNivelForm(form.nivel)
          : usuario.rol;

      const salarioParsed =
        form.salario_base.trim() === ""
          ? null
          : Number(String(form.salario_base).replace(/\./g, "").replace(/\s/g, ""));
      const salarioOk = salarioParsed != null && Number.isFinite(salarioParsed) ? salarioParsed : null;

      const nextOmni =
        usuario.omnicanal && usuario.puede_editar_modulos
          ? {
              ...usuario.omnicanal,
              agent_enabled: omniAgent,
              work_schedule_id:
                omniAgent && omniScheduleId.trim() ? omniScheduleId.trim() : null,
            }
          : usuario.omnicanal;

      let nextDefaultDashboardId: string | null = usuario.default_dashboard_view_id ?? null;
      if (
        usuario.puede_editar_modulos &&
        !usuario.es_admin_empresa &&
        (usuario.dashboard_views_empresa?.length ?? 0) > 0
      ) {
        const t = form.default_dashboard_view_id.trim();
        nextDefaultDashboardId =
          t && form.dashboard_view_ids.includes(t)
            ? t
            : form.dashboard_view_ids.length === 1
              ? form.dashboard_view_ids[0] ?? null
              : null;
      }

      setUsuario({
        ...usuario,
        sucursal_id: form.sucursal_id || null,
        nombre: form.nombre.trim(),
        email: form.email.trim().toLowerCase(),
        telefono: form.telefono.trim() || null,
        fecha_nacimiento: form.fecha_nacimiento || null,
        fecha_ingreso: form.fecha_ingreso || null,
        tipo_contrato: form.tipo_contrato,
        salario_base: salarioOk,
        porcentaje_comision: pctNum,
        ips: form.ips,
        area: form.area,
        estado: form.estado,
        rol: rolActualizado ?? usuario.rol,
        modulo_ids:
          usuario.puede_editar_modulos && !usuario.es_admin_empresa ? [...form.modulo_ids] : usuario.modulo_ids,
        dashboard_view_ids:
          usuario.puede_editar_modulos && !usuario.es_admin_empresa
            ? [...form.dashboard_view_ids]
            : usuario.dashboard_view_ids,
        default_dashboard_view_id: nextDefaultDashboardId,
        omnicanal: nextOmni ?? usuario.omnicanal,
      });
      setEditing(false);
      setSuccessMessage("Cambios guardados correctamente en la base de datos.");
      // Reset a null por useAutoClearFlag (5s con cleanup en unmount).
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function aplicarResetPassword() {
    setPwdError(null);
    setPwdSuccess(null);
    if (!usuario?.puede_editar_rol) return;
    if (!pwdNew || pwdNew.length < 6) {
      setPwdError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (pwdNew !== pwdNew2) {
      setPwdError("Las contraseñas no coinciden.");
      return;
    }
    setPwdLoading(true);
    try {
      const res = await fetchWithSupabaseSession(`/api/empresas/usuarios/${id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwdNew }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo actualizar");
      setPwdSuccess("Contraseña actualizada. El usuario puede iniciar sesión con la nueva clave.");
      setPwdNew("");
      setPwdNew2("");
      // Reset por useAutoClearFlag (6s, cleanup garantizado).
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "Error al restablecer");
    } finally {
      setPwdLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Link href="/usuarios" className="hover:text-gray-700 transition-colors">
            Usuarios
          </Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">Error</span>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-4">
          <p className="font-medium">{loadError}</p>
          <p className="text-xs text-red-600 mt-2">
            Los cambios no se guardaron. Verificá que tenés permiso para editar este usuario.
          </p>
        </div>
        <Link href="/usuarios" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800">
          ← Volver a usuarios
        </Link>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Cargando…
      </div>
    );
  }

  function formatFecha(s?: string | null) {
    if (!s) return "—";
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }

  /** API de password exige admin/super_admin — alineado con puede_editar_rol. */
  const showResetPwd = usuario.puede_editar_rol === true;

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/usuarios" className="hover:text-gray-700 transition-colors">
          Usuarios
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{usuario.nombre ?? usuario.email}</span>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0 text-green-600">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0 bg-violet-500">
            {(usuario.nombre ?? usuario.email)
              .split(" ")
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase() || "?"}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{usuario.nombre ?? "—"}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{usuario.email}</p>
            <span
              className={`inline-flex mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                usuario.estado === "activo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {usuario.estado ?? "activo"}
            </span>
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
            </svg>
            Editar
          </button>
        )}
      </div>

      {!editing && (
        <div className="space-y-6">
          <SectionCard title="Datos personales" icon="👤">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                { label: "Nombre", value: usuario.nombre ?? "—" },
                { label: "Email", value: usuario.email },
                { label: "Teléfono", value: usuario.telefono ?? "—" },
                { label: "Fecha nacimiento", value: formatFecha(usuario.fecha_nacimiento) },
              ].map((i) => (
                <div key={i.label}>
                  <p className="text-xs text-gray-400">{i.label}</p>
                  <p className="font-medium text-gray-800">{i.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Datos laborales" icon="💼">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                { label: "Fecha de ingreso", value: formatFecha(usuario.fecha_ingreso) },
                { label: "Tipo de contrato", value: labelTipoContrato(usuario.tipo_contrato) },
                { label: "Salario base (Gs.)", value: fmtGs(usuario.salario_base ?? undefined) },
                {
                  label: "Comisión (%)",
                  value:
                    usuario.porcentaje_comision != null ? String(usuario.porcentaje_comision) : "—",
                },
                { label: "IPS", value: usuario.ips ? "Sí" : "No" },
              ].map((i) => (
                <div key={i.label}>
                  <p className="text-xs text-gray-400">{i.label}</p>
                  <p className="font-medium text-gray-800">{i.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Accesos del sistema" icon="🔐">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                { label: "Nivel", value: labelNivelDisplay(usuario.rol) },
                { label: "Área", value: labelArea(usuario.area) },
                {
                  label: "Sucursal",
                  value: usuario.sucursal_id
                    ? (sucursalActualOpt?.nombre ?? "—")
                    : nivelFromRolDb(usuario.rol) === "administrador"
                      ? "Todas las sucursales"
                      : "— sin asignar —",
                },
              ].map((i) => (
                <div key={i.label}>
                  <p className="text-xs text-gray-400">{i.label}</p>
                  <p className="font-medium text-gray-800">{i.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {usuario.omnicanal && (
            <SectionCard title="Omnicanal" icon="💬">
              {omnicanalWarning ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {omnicanalWarning}
                </div>
              ) : null}
              <p className="text-xs text-gray-500 mb-3">
                Colas y asignación: requiere habilitación explícita (independiente del rol ERP).
              </p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Habilitado como agente</p>
                  <p className="font-medium text-gray-800">{usuario.omnicanal.agent_enabled ? "Sí" : "No"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Horario de trabajo</p>
                  <p className="font-medium text-gray-800">
                    {(() => {
                      const sid = usuario.omnicanal.work_schedule_id;
                      if (!sid) return "—";
                      const s = usuario.omnicanal.schedules.find((x) => x.id === sid);
                      return s?.nombre ?? "—";
                    })()}
                  </p>
                </div>
              </div>
            </SectionCard>
          )}

          {(usuario.dashboard_views_empresa?.length ?? 0) > 0 && (
            <SectionCard title="Vistas del dashboard" icon="📊">
              {usuario.es_admin_empresa ? (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Los administradores pueden usar todas las vistas del tablero que la empresa tenga habilitadas.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {(usuario.dashboard_views_empresa ?? []).map((m) => (
                      <li
                        key={m.id}
                        className="text-sm font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200"
                      >
                        {m.nombre}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Pestañas del tablero principal visibles para este usuario.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {(usuario.dashboard_views_empresa ?? [])
                      .filter((m) => (usuario.dashboard_view_ids ?? []).includes(m.id))
                      .map((m) => (
                        <li
                          key={m.id}
                          className="text-sm font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200"
                        >
                          {m.nombre}
                          {usuario.default_dashboard_view_id === m.id ? (
                            <span className="ml-1 text-xs text-slate-500">(predeterminada)</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </SectionCard>
          )}

          {(usuario.modulos_empresa?.length ?? 0) > 0 && (
            <SectionCard title="Módulos del usuario" icon="📦">
              {usuario.es_admin_empresa ? (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Los administradores de la empresa tienen acceso automático a todos los módulos habilitados para la
                    organización. No hace falta asignarlos uno a uno.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {(usuario.modulos_empresa ?? []).map((m) => (
                      <li
                        key={m.id}
                        className="text-sm font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200"
                      >
                        {m.nombre}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Módulos habilitados para la empresa que este usuario puede usar (supervisores y usuarios operativos).
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {(usuario.modulos_empresa ?? [])
                      .filter((m) => (usuario.modulo_ids ?? []).includes(m.id))
                      .map((m) => (
                        <li
                          key={m.id}
                          className="text-sm font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200"
                        >
                          {m.nombre}
                        </li>
                      ))}
                  </ul>
                  {(usuario.modulo_ids ?? []).length === 0 && (
                    <p className="text-sm text-amber-700 mt-2">
                      Sin módulos asignados (solo verá el inicio hasta que un administrador asigne módulos).
                    </p>
                  )}
                </>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={handleGuardar} className="space-y-6">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{formError}</div>
          )}

          <UsuarioFormFields
            variant="edit"
            form={form}
            onChange={handleChange}
            onSalarioBaseChange={(n) => setForm((prev) => ({ ...prev, salario_base: String(n) }))}
            fieldClassName={usuarioFormInputGray}
            nivelAccesoDisabled={!usuario.puede_editar_rol}
            sucursales={sucursales}
            sucursalesError={sucursalesError}
            onRecargarSucursales={recargarSucursales}
            sucursalActual={sucursalActualOpt}
            extraSections={
              <>
                {showResetPwd ? (
                  <SectionCard title="Restablecer contraseña" icon="🔑">
                    <p className="text-xs text-gray-500 mb-4">
                      Definí una nueva contraseña para este usuario. Se actualiza en Supabase Auth de forma segura (mismo
                      mecanismo que al crear usuario o vincular correo existente).
                    </p>
                    {pwdError && (
                      <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                        {pwdError}
                      </div>
                    )}
                    {pwdSuccess && (
                      <div className="mb-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2">
                        {pwdSuccess}
                      </div>
                    )}
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Nueva contraseña
                          </label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={pwdNew}
                            onChange={(e) => setPwdNew(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.preventDefault();
                            }}
                            className={usuarioFormInputGray}
                            placeholder="Mínimo 6 caracteres"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Confirmar
                          </label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={pwdNew2}
                            onChange={(e) => setPwdNew2(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.preventDefault();
                            }}
                            className={usuarioFormInputGray}
                            placeholder="Repetir contraseña"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={pwdLoading}
                        onClick={() => void aplicarResetPassword()}
                        className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {pwdLoading ? "Actualizando…" : "Actualizar contraseña"}
                      </button>
                    </div>
                  </SectionCard>
                ) : null}

                {/* Idioma del usuario (fase 2 tanda 19) */}
                <IdiomaUsuarioPanel usuarioId={String(id)} />

                {/* Permisos granulares por acción (fase 2 tanda 10) */}
                {usuario.puede_editar_modulos && !usuario.es_admin_empresa && (usuario.modulo_ids?.length ?? 0) > 0 && (
                  <AccionesGranularesPanel usuarioId={String(id)} moduloIds={usuario.modulo_ids ?? []} />
                )}

                {usuario.puede_editar_modulos && !usuario.es_admin_empresa && (usuario.modulos_empresa?.length ?? 0) > 0 ? (
                  <SectionCard title="Módulos del usuario" icon="📦">
                    <p className="text-xs text-gray-500 mb-4">
                      Solo aplica a supervisores y usuarios. Marcá los módulos que esta persona puede usar (lo habilitado
                      para tu empresa).
                    </p>
                    <div className="space-y-2">
                      {(usuario.modulos_empresa ?? []).map((m) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            name={`modulo_${m.id}`}
                            value={m.id}
                            checked={form.modulo_ids.includes(m.id)}
                            onChange={handleChange}
                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                          />
                          <span className="text-sm font-medium text-gray-800">{m.nombre}</span>
                          <span className="text-xs text-gray-400 ml-auto font-mono">{m.slug}</span>
                        </label>
                      ))}
                    </div>
                  </SectionCard>
                ) : null}

                {usuario.puede_editar_modulos &&
                !usuario.es_admin_empresa &&
                (usuario.dashboard_views_empresa?.length ?? 0) > 0 ? (
                  <SectionCard title="Vistas del dashboard" icon="📊">
                    <p className="text-xs text-gray-500 mb-4">
                      Solo podés marcar vistas que tu empresa ya tenga habilitadas. Si tenés más de una, elegí cuál abrir
                      por defecto.
                    </p>
                    <div className="space-y-2">
                      {(usuario.dashboard_views_empresa ?? []).map((m) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            name={`dash_${m.id}`}
                            value={m.id}
                            checked={form.dashboard_view_ids.includes(m.id)}
                            onChange={handleChange}
                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                          />
                          <span className="text-sm font-medium text-gray-800">{m.nombre}</span>
                        </label>
                      ))}
                    </div>
                    {form.dashboard_view_ids.length > 1 ? (
                      <div className="mt-4 max-w-md">
                        <label className={usuarioFormLabel}>Vista por defecto</label>
                        <select
                          value={
                            form.default_dashboard_view_id &&
                            form.dashboard_view_ids.includes(form.default_dashboard_view_id)
                              ? form.default_dashboard_view_id
                              : ""
                          }
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, default_dashboard_view_id: e.target.value }))
                          }
                          className={`${usuarioFormInputGray} mt-1 w-full`}
                        >
                          <option value="">— Elegir —</option>
                          {(usuario.dashboard_views_empresa ?? [])
                            .filter((m) => form.dashboard_view_ids.includes(m.id))
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nombre}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : null}
                  </SectionCard>
                ) : null}

                {usuario.puede_editar_modulos && usuario.omnicanal ? (
                  <SectionCard title="Omnicanal" icon="💬">
                    {omnicanalWarning ? (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        {omnicanalWarning}
                      </div>
                    ) : null}
                    <p className="text-xs text-gray-500 mb-4">
                      Solo usuarios habilitados entran en autoasignación y circuito operativo de agentes (además de colas,
                      estado disponible y sesión en línea).
                    </p>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={omniAgent}
                        onChange={(e) => {
                          setOmniAgent(e.target.checked);
                          if (!e.target.checked) setOmniScheduleId("");
                        }}
                        className="rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                      />
                      <span className="text-sm font-medium text-gray-800">Habilitar como agente omnicanal</span>
                    </label>
                    {omniAgent ? (
                      <div className="mt-4 max-w-md">
                        <label className={usuarioFormLabel}>Horario de trabajo</label>
                        <select
                          value={omniScheduleId}
                          onChange={(e) => setOmniScheduleId(e.target.value)}
                          className={`${usuarioFormInputGray} mt-1 w-full`}
                        >
                          <option value="">— Elegir horario —</option>
                          {usuario.omnicanal.schedules
                            .filter((s) => s.is_active !== false)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre} ({String(s.time_start ?? "").slice(0, 5)} –{" "}
                                {String(s.time_end ?? "").slice(0, 5)})
                              </option>
                            ))}
                        </select>
                        {usuario.omnicanal.schedules.length === 0 ? (
                          <p className="mt-2 text-xs text-amber-700">
                            No hay plantillas de horario. Creá una en{" "}
                            <Link href="/configuracion/omnicanal-horarios" className="font-semibold underline">
                              Configuración → Horarios omnicanal
                            </Link>
                            .
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </SectionCard>
                ) : null}
              </>
            }
          />

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                if (usuario) {
                  setForm({
                    ...usuarioToForm(usuario),
                    modulo_ids: usuario.modulo_ids ?? [],
                    dashboard_view_ids: usuario.dashboard_view_ids ?? [],
                    default_dashboard_view_id: usuario.default_dashboard_view_id ?? "",
                  });
                }
                if (usuario?.omnicanal) {
                  setOmniAgent(Boolean(usuario.omnicanal.agent_enabled));
                  setOmniScheduleId(usuario.omnicanal.work_schedule_id ?? "");
                }
                setFormError(null);
                setOmnicanalWarning(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors px-4 py-2.5"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function UsuarioDetailPage() {
  return (
    <Suspense
      fallback={<div className="flex items-center justify-center py-24 text-sm text-gray-400">Cargando…</div>}
    >
      <UsuarioDetailContent />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Permisos granulares por acción (fase 2 tanda 10)
// ─────────────────────────────────────────────────────────────────────────

const ACCIONES_LABEL: Record<string, string> = {
  ver: "Ver", crear: "Crear", editar: "Editar", eliminar: "Eliminar",
  anular: "Anular", descontar: "Descontar", conciliar: "Conciliar", autorizar: "Autorizar",
};
const ACCIONES_BASE = ["ver", "crear", "editar", "eliminar"] as const;

type PermFila = {
  modulo_id: string;
  slug: string;
  nombre: string;
  acciones: Record<string, boolean>;
};

function IdiomaUsuarioPanel({ usuarioId }: { usuarioId: string }) {
  const [lang, setLang] = useState<"es" | "pt-BR" | "en">("es");
  const [cargando, setCargando] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);
  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession(`/api/usuarios/${usuarioId}/idioma`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setLang((j.data?.lang as "es"|"pt-BR"|"en") ?? "es"); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [usuarioId]);
  async function guardar(nuevo: "es" | "pt-BR" | "en") {
    setSaving(true); setMsg(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/usuarios/${usuarioId}/idioma`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: nuevo }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setLang(nuevo);
      setMsg({ tipo: "ok", texto: "Idioma actualizado. El usuario verá el cambio en su próximo inicio de sesión." });
      setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setMsg({ tipo: "err", texto: e instanceof Error ? e.message : "Error" });
    } finally { setSaving(false); }
  }
  return (
    <SectionCard title="Idioma del usuario" icon="🌎">
      <p className="text-xs text-gray-500 mb-3">
        Elegí el idioma con el que este usuario ve la interfaz. Las sucursales de Brasil usan portugués con moneda R$.
      </p>
      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse">Cargando…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {([
            ["es", "🇵🇾 Español (Gs.)"],
            ["pt-BR", "🇧🇷 Português (R$)"],
            ["en", "🇺🇸 English (US$)"],
          ] as const).map(([code, label]) => (
            <button key={code} type="button" disabled={saving}
              onClick={() => guardar(code)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
                lang === code
                  ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20"
                  : "border-slate-200 bg-white text-slate-600 hover:border-[#4FAEB2] hover:text-[#3F8E91]"
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${
          msg.tipo === "ok" ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border border-red-200 bg-red-50 text-red-700"
        }`}>{msg.texto}</p>
      )}
    </SectionCard>
  );
}

function AccionesGranularesPanel({ usuarioId, moduloIds }: { usuarioId: string; moduloIds: string[] }) {
  const [filas, setFilas] = useState<PermFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    fetchWithSupabaseSession(`/api/usuarios/${usuarioId}/acciones`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setFilas((j.data?.acciones ?? []) as PermFila[]);
        setWarning(j.data?.warning ?? null);
      })
      .catch((e) => { if (!cancel) setErr(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
    // Refetch cuando cambian los módulos otorgados (ej: se marca uno nuevo).
  }, [usuarioId, moduloIds.join(",")]);

  async function togglear(f: PermFila, accion: string) {
    const key = `${f.modulo_id}:${accion}`;
    setSavingKey(key); setErr(null);
    const nuevoValor = !f.acciones[accion];
    // Optimista
    setFilas((prev) => prev.map((x) => x.modulo_id === f.modulo_id
      ? { ...x, acciones: { ...x.acciones, [accion]: nuevoValor } } : x));
    try {
      const r = await fetchWithSupabaseSession(`/api/usuarios/${usuarioId}/acciones`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo_id: f.modulo_id, acciones: { [accion]: nuevoValor } }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
    } catch (e) {
      // Revertir en error
      setFilas((prev) => prev.map((x) => x.modulo_id === f.modulo_id
        ? { ...x, acciones: { ...x.acciones, [accion]: !nuevoValor } } : x));
      setErr(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <SectionCard title="Permisos por acción" icon="🔒">
      <p className="text-xs text-gray-500 mb-4">
        Para cada módulo con acceso, elegí qué puede hacer este usuario. Las 4 acciones base van tildadas por defecto —
        destildar restringe el permiso.
      </p>
      {warning && <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</p>}
      {err && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-4 text-center">Cargando permisos…</p>
      ) : filas.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">Sin módulos otorgados todavía. Marcá módulos en el bloque de abajo primero.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Módulo</th>
                {ACCIONES_BASE.map((a) => (
                  <th key={a} className="text-center px-2 py-2 text-[11px] uppercase font-semibold text-slate-600 w-20">
                    {ACCIONES_LABEL[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => (
                <tr key={f.modulo_id}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-800">{f.nombre}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{f.slug}</p>
                  </td>
                  {ACCIONES_BASE.map((a) => {
                    const key = `${f.modulo_id}:${a}`;
                    return (
                      <td key={a} className="text-center px-2 py-2">
                        <input
                          type="checkbox"
                          checked={f.acciones[a] === true}
                          disabled={savingKey === key}
                          onChange={() => togglear(f, a)}
                          className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
