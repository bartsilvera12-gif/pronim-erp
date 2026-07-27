"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useT } from "@/lib/i18n/context";
import { useIsSuperAdmin } from "@/lib/auth/use-is-admin";
import MontoInput from "@/components/ui/MontoInput";
import WebUploadButton from "@/components/web-admin/WebUploadButton";

/**
 * Admin: Tesoros del sitio publico (Akakua'a).
 *
 * Solo super_admin. Server-side los endpoints tambien validan; este gate es
 * de UI. Cada tesoro es una foto o video con url a un asset en
 * /akakuaa/tesoros/* o URL absoluta (Cloudinary). Reorden = editar el numero
 * `orden` a mano.
 */

type Tesoro = {
  id: string;
  tipo: "foto" | "video";
  url: string;
  titulo: string | null;
  subtitulo: string | null;
  precio: number | null;
  sku_franja: string | null;
  orden: number;
  activo: boolean;
};

type Draft = {
  id?: string;
  tipo: "foto" | "video";
  url: string;
  titulo: string;
  subtitulo: string;
  precio: number;
  sku_franja: string;
  orden: number;
  activo: boolean;
};

function emptyDraft(): Draft {
  return {
    tipo: "foto",
    url: "",
    titulo: "",
    subtitulo: "",
    precio: 0,
    sku_franja: "",
    orden: 0,
    activo: true,
  };
}

function draftFromTesoro(t: Tesoro): Draft {
  return {
    id: t.id,
    tipo: t.tipo,
    url: t.url,
    titulo: t.titulo ?? "",
    subtitulo: t.subtitulo ?? "",
    precio: t.precio ?? 0,
    sku_franja: t.sku_franja ?? "",
    orden: t.orden,
    activo: t.activo,
  };
}

export default function AdminWebTesorosPage() {
  const t = useT();
  const { isSuperAdmin, loaded: rolLoaded } = useIsSuperAdmin();

  const [tesoros, setTesoros] = useState<Tesoro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/admin/web/tesoros", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error al cargar");
      const rows = ((j.data?.tesoros ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c.id),
        tipo: (c.tipo === "video" ? "video" : "foto") as "foto" | "video",
        url: String(c.url ?? ""),
        titulo: c.titulo == null ? null : String(c.titulo),
        subtitulo: c.subtitulo == null ? null : String(c.subtitulo),
        precio: c.precio == null ? null : Number(c.precio),
        sku_franja: c.sku_franja == null ? null : String(c.sku_franja),
        orden: Number(c.orden ?? 0),
        activo: c.activo === true,
      })) as Tesoro[];
      setTesoros(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (rolLoaded && isSuperAdmin) void cargar();
  }, [rolLoaded, isSuperAdmin]);

  async function togglearActivo(row: Tesoro) {
    try {
      const r = await fetchWithSupabaseSession(`/api/admin/web/tesoros/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !row.activo }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function actualizarOrden(row: Tesoro, nuevo: number) {
    if (!Number.isFinite(nuevo) || nuevo === row.orden) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/admin/web/tesoros/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: nuevo }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function eliminar(row: Tesoro) {
    if (!window.confirm(t("¿Eliminar este tesoro? Esta acción es permanente."))) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/admin/web/tesoros/${row.id}`, {
        method: "DELETE",
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function guardarDraft() {
    if (!draft) return;
    const url = draft.url.trim();
    if (!url) {
      setError(t("La URL es obligatoria."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        tipo: draft.tipo,
        url,
        titulo: draft.titulo.trim() || null,
        subtitulo: draft.subtitulo.trim() || null,
        precio: draft.precio && draft.precio > 0 ? draft.precio : null,
        sku_franja: draft.sku_franja.trim() || null,
        orden: draft.orden,
        activo: draft.activo,
      };
      const url_endpoint = draft.id
        ? `/api/admin/web/tesoros/${draft.id}`
        : "/api/admin/web/tesoros";
      const method = draft.id ? "PATCH" : "POST";
      const r = await fetchWithSupabaseSession(url_endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      setDraft(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  if (!rolLoaded) {
    return <div className="p-6 text-sm text-slate-500">{t("Cargando…")}</div>;
  }
  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("Solo super_admin puede administrar los tesoros del sitio.")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Tesoros (web)")}</h1>
          <p className="text-sm text-slate-600">
            {t("Fotos y videos que aparecen en el carrusel «Tesoros que acaban de llegar» del sitio público.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            ← {t("Volver")}
          </Link>
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
          >
            + {t("Nuevo tesoro")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">{t("Cargando…")}</p>
        ) : tesoros.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t("Todavía no hay tesoros cargados. Creá el primero con «+ Nuevo tesoro».")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">{t("Preview")}</th>
                  <th className="pb-2 pr-3">{t("Tipo")}</th>
                  <th className="pb-2 pr-3">{t("Título")}</th>
                  <th className="pb-2 pr-3 text-right">{t("Precio")}</th>
                  <th className="pb-2 pr-3 text-right">{t("Orden")}</th>
                  <th className="pb-2 pr-3 text-center">{t("Activo")}</th>
                  <th className="pb-2 text-right">{t("Acciones")}</th>
                </tr>
              </thead>
              <tbody>
                {tesoros.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3">
                      <Preview url={row.url} tipo={row.tipo} />
                    </td>
                    <td className="py-2 pr-3 text-xs uppercase tracking-wide text-slate-500">
                      {row.tipo}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-800">{row.titulo ?? "—"}</div>
                      {row.subtitulo && (
                        <div className="text-xs text-slate-500">{row.subtitulo}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                      {row.precio == null
                        ? "—"
                        : "Gs. " + Math.round(row.precio).toLocaleString("es-PY").replace(/,/g, ".")}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        defaultValue={row.orden}
                        onBlur={(e) => actualizarOrden(row, Number(e.target.value))}
                        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <button
                        type="button"
                        onClick={() => togglearActivo(row)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.activo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.activo ? t("Activo") : t("Inactivo")}
                      </button>
                    </td>
                    <td className="py-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setDraft(draftFromTesoro(row))}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        {t("Editar")}
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(row)}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {t("Eliminar")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft && (
        <TesoroModal
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onClose={() => setDraft(null)}
          onSave={guardarDraft}
        />
      )}
    </div>
  );
}

function Preview({ url, tipo }: { url: string; tipo: "foto" | "video" }) {
  if (!url) {
    return <div className="h-14 w-14 rounded-md bg-slate-100" />;
  }
  if (tipo === "video") {
    return (
      <div className="relative h-14 w-14 overflow-hidden rounded-md bg-slate-900">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center text-white/90">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="preview" className="h-14 w-14 rounded-md object-cover" />;
}

function TesoroModal({
  draft,
  setDraft,
  saving,
  onClose,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {draft.id ? t("Editar tesoro") : t("Nuevo tesoro")}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">{t("Tipo")}</label>
            <div className="mt-1 flex gap-2">
              {(["foto", "video"] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setDraft({ ...draft, tipo })}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    draft.tipo === tipo
                      ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {tipo === "foto" ? t("Foto") : t("Video")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">{t("Archivo")}</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder={t("Pegá una URL o subí un archivo →")}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <WebUploadButton
                modulo="tesoros"
                accept="image/*,video/mp4,video/webm"
                onUploaded={(url, tipoDetectado) => setDraft({ ...draft, url, tipo: tipoDetectado })}
                labelIdle={t("Subir")}
                labelBusy={t("Subiendo…")}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t("Subí una foto o video desde tu compu, o pegá una URL (Cloudinary, etc.). Max 20 MB. Los videos pasan a 'Video' automáticamente.")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Título")}</label>
              <input
                type="text"
                value={draft.titulo}
                onChange={(e) => setDraft({ ...draft, titulo: e.target.value })}
                placeholder={t("Ej: Converse All Star talle 27")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Subtítulo")}</label>
              <input
                type="text"
                value={draft.subtitulo}
                onChange={(e) => setDraft({ ...draft, subtitulo: e.target.value })}
                placeholder={t("Ej: Recién llegados")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Precio (Gs.)")}</label>
              <MontoInput
                value={draft.precio}
                onChange={(n) => setDraft({ ...draft, precio: n })}
                decimals={false}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {t("Opcional. Se muestra como badge en la web.")}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t("SKU franja (opcional)")}</label>
              <input
                type="text"
                value={draft.sku_franja}
                onChange={(e) => setDraft({ ...draft, sku_franja: e.target.value })}
                placeholder="FRJ-104000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Orden")}</label>
              <input
                type="number"
                value={draft.orden}
                onChange={(e) => setDraft({ ...draft, orden: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {t("Menor = primero en el carrusel.")}
              </p>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.activo}
                  onChange={(e) => setDraft({ ...draft, activo: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]/40"
                />
                {t("Activo")}
              </label>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {t("Cancelar")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !draft.url.trim()}
            className="rounded-lg bg-[#4FAEB2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40"
          >
            {saving ? t("Guardando…") : t("Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}
