"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useT } from "@/lib/i18n/context";
import { useIsSuperAdmin } from "@/lib/auth/use-is-admin";
import WebUploadButton from "@/components/web-admin/WebUploadButton";
import MontoInput from "@/components/ui/MontoInput";

/**
 * Admin: Catálogo del sitio publico (Akakua'a).
 *
 * Solo super_admin. Módulo APARTE de "Categorías de precio" (/admin/categorias)
 * y de las franjas — es un catálogo curado con fotos que alimenta /catalogo.
 * Karen pega URLs (Cloudinary o /akakuaa/catalogo/xxx.jpg); el upload de
 * archivos todavia no esta integrado.
 */

type Item = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | null;
  categoria: string | null;
  edad: string | null;
  imagen_url: string;
  sku_franja: string | null;
  orden: number;
  activo: boolean;
  destacado: boolean;
};

type Draft = {
  id?: string;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: string;
  edad: string;
  imagen_url: string;
  sku_franja: string;
  orden: number;
  activo: boolean;
  destacado: boolean;
};

function emptyDraft(): Draft {
  return {
    nombre: "",
    descripcion: "",
    precio: 0,
    categoria: "",
    edad: "",
    imagen_url: "",
    sku_franja: "",
    orden: 0,
    activo: true,
    destacado: false,
  };
}

function draftFromItem(i: Item): Draft {
  return {
    id: i.id,
    nombre: i.nombre,
    descripcion: i.descripcion ?? "",
    precio: i.precio ?? 0,
    categoria: i.categoria ?? "",
    edad: i.edad ?? "",
    imagen_url: i.imagen_url,
    sku_franja: i.sku_franja ?? "",
    orden: i.orden,
    activo: i.activo,
    destacado: i.destacado,
  };
}

export default function AdminWebCatalogoPage() {
  const t = useT();
  const { isSuperAdmin, loaded: rolLoaded } = useIsSuperAdmin();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // Filtro de listado por categoría — mismo criterio que la web
  // pública (chips de categorías). Karen quiere elegir de las que
  // ya existen y ver solo esa.
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");

  // Sugerencias derivadas de los items existentes — se usan tanto
  // en el <datalist> del form (para elegir de las que ya están) como
  // en el selector del filtro superior. Case-sensitive: si Karen
  // cambia mayúsculas, se registran como categorías distintas.
  const categoriasSugeridas = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const c = (it.categoria ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);
  const edadesSugeridas = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const e = (it.edad ?? "").trim();
      if (e) set.add(e);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);
  const itemsFiltrados = useMemo(() => {
    if (!filtroCategoria) return items;
    return items.filter((it) => (it.categoria ?? "").trim() === filtroCategoria);
  }, [items, filtroCategoria]);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/admin/web/catalogo", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error al cargar");
      const rows = ((j.data?.items ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c.id),
        nombre: String(c.nombre ?? ""),
        descripcion: c.descripcion == null ? null : String(c.descripcion),
        precio: c.precio == null ? null : Number(c.precio),
        categoria: c.categoria == null ? null : String(c.categoria),
        edad: c.edad == null ? null : String(c.edad),
        imagen_url: String(c.imagen_url ?? ""),
        sku_franja: c.sku_franja == null ? null : String(c.sku_franja),
        orden: Number(c.orden ?? 0),
        activo: c.activo === true,
        destacado: c.destacado === true,
      })) as Item[];
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (rolLoaded && isSuperAdmin) void cargar();
  }, [rolLoaded, isSuperAdmin]);

  async function patch(row: Item, body: Record<string, unknown>) {
    try {
      const r = await fetchWithSupabaseSession(`/api/admin/web/catalogo/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function eliminar(row: Item) {
    if (!window.confirm(t("¿Eliminar este producto del catálogo? Esta acción es permanente."))) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/admin/web/catalogo/${row.id}`, {
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
    const nombre = draft.nombre.trim();
    const imagen = draft.imagen_url.trim();
    if (!nombre) {
      setError(t("El nombre es obligatorio."));
      return;
    }
    if (!imagen) {
      setError(t("La imagen URL es obligatoria."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        nombre,
        imagen_url: imagen,
        descripcion: draft.descripcion.trim() || null,
        precio: draft.precio && draft.precio > 0 ? draft.precio : null,
        categoria: draft.categoria.trim() || null,
        edad: draft.edad.trim() || null,
        sku_franja: draft.sku_franja.trim() || null,
        orden: draft.orden,
        activo: draft.activo,
        destacado: draft.destacado,
      };
      const url_endpoint = draft.id
        ? `/api/admin/web/catalogo/${draft.id}`
        : "/api/admin/web/catalogo";
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
          {t("Solo super_admin puede administrar el catálogo del sitio.")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Catálogo (web)")}</h1>
          <p className="text-sm text-slate-600">
            {t("Productos curados que aparecen en la página /catalogo del sitio público. Módulo aparte de «Categorías de precio».")}
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
            + {t("Nuevo producto")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filtro por categoría — replica el criterio de los chips de la
          web pública (/catalogo). Al elegir una, la tabla se filtra a
          esa sola. La opción "Todas" (vacía) muestra el listado completo. */}
      {items.length > 0 && categoriasSugeridas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-600">
            {t("Filtrar por categoría")}
          </label>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
          >
            <option value="">{t("Todas")}</option>
            {categoriasSugeridas.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {filtroCategoria && (
            <button
              type="button"
              onClick={() => setFiltroCategoria("")}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              {t("Limpiar filtro")}
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">
            {itemsFiltrados.length} {itemsFiltrados.length === 1 ? t("producto") : t("productos")}
          </span>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">{t("Cargando…")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t("Todavía no hay productos en el catálogo. Creá el primero con «+ Nuevo producto».")}
          </p>
        ) : itemsFiltrados.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t("No hay productos en esa categoría.")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">{t("Foto")}</th>
                  <th className="pb-2 pr-3">{t("Nombre")}</th>
                  <th className="pb-2 pr-3">{t("Categoría")}</th>
                  <th className="pb-2 pr-3 text-right">{t("Precio")}</th>
                  <th className="pb-2 pr-3 text-right">{t("Orden")}</th>
                  <th className="pb-2 pr-3 text-center">{t("Destacado")}</th>
                  <th className="pb-2 pr-3 text-center">{t("Activo")}</th>
                  <th className="pb-2 text-right">{t("Acciones")}</th>
                </tr>
              </thead>
              <tbody>
                {itemsFiltrados.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3">
                      <Preview url={row.imagen_url} />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-800">{row.nombre}</div>
                      {row.edad && (
                        <div className="text-xs text-slate-500">{row.edad}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{row.categoria ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                      {row.precio == null
                        ? "—"
                        : "Gs. " + Math.round(row.precio).toLocaleString("es-PY").replace(/,/g, ".")}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        defaultValue={row.orden}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n !== row.orden) void patch(row, { orden: n });
                        }}
                        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <button
                        type="button"
                        onClick={() => patch(row, { destacado: !row.destacado })}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.destacado
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.destacado ? t("Sí") : t("No")}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <button
                        type="button"
                        onClick={() => patch(row, { activo: !row.activo })}
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
                        onClick={() => setDraft(draftFromItem(row))}
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
        <ItemModal
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

function Preview({ url }: { url: string }) {
  if (!url) return <div className="h-14 w-14 rounded-md bg-slate-100" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="preview" className="h-14 w-14 rounded-md object-cover" />;
}

function ItemModal({
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
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {draft.id ? t("Editar producto") : t("Nuevo producto")}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">{t("Nombre")}</label>
            <input
              type="text"
              value={draft.nombre}
              onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
              placeholder={t("Ej: Vestido floral talle 4")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">{t("Descripción")}</label>
            <textarea
              value={draft.descripcion}
              onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
              rows={3}
              placeholder={t("Detalles del producto (opcional)")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">{t("Imagen")}</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={draft.imagen_url}
                onChange={(e) => setDraft({ ...draft, imagen_url: e.target.value })}
                placeholder={t("Pegá una URL o subí un archivo →")}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <WebUploadButton
                modulo="catalogo"
                onUploaded={(url) => setDraft({ ...draft, imagen_url: url })}
                accept="image/*"
                labelIdle={t("Subir imagen")}
                labelBusy={t("Subiendo…")}
              />
            </div>
            {draft.imagen_url && (
              <div className="mt-2">
                <Preview url={draft.imagen_url} />
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {t("Subí un archivo desde tu compu o pegá una URL (Cloudinary, etc.). Max 20 MB.")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Categoría")}</label>
              <input
                type="text"
                list="cat-web-sugeridas"
                value={draft.categoria}
                onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}
                placeholder={t("Elegí una o escribí nueva")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <datalist id="cat-web-sugeridas">
                {categoriasSugeridas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="mt-1 text-[10px] text-slate-400">
                {t("Las categorías se generan automáticamente a partir de los productos cargados. Escribí una nueva para crearla.")}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Edad")}</label>
              <input
                type="text"
                list="edad-web-sugeridas"
                value={draft.edad}
                onChange={(e) => setDraft({ ...draft, edad: e.target.value })}
                placeholder={t("Elegí una o escribí nueva")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <datalist id="edad-web-sugeridas">
                {edadesSugeridas.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
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
                {t("Opcional.")}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Orden")}</label>
              <input
                type="number"
                value={draft.orden}
                onChange={(e) => setDraft({ ...draft, orden: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {t("Menor = primero.")}
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
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.destacado}
                  onChange={(e) => setDraft({ ...draft, destacado: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]/40"
                />
                {t("Destacado")}
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
            disabled={saving || !draft.nombre.trim() || !draft.imagen_url.trim()}
            className="rounded-lg bg-[#4FAEB2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40"
          >
            {saving ? t("Guardando…") : t("Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}
