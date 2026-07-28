"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useT } from "@/lib/i18n/context";
import { useIsSuperAdmin } from "@/lib/auth/use-is-admin";
import WebUploadButton from "@/components/web-admin/WebUploadButton";
import RichTextEditor from "@/components/web-admin/RichTextEditor";

/**
 * Admin: Blog del sitio publico (Akakua'a).
 *
 * Solo super_admin. Karen crea posts que alimentan blog.html + post.html
 * en el repo `akakuaa` — los HTML estáticos hacen fetch a
 * /api/publico/blog-posts.
 */

type Post = {
  id: string;
  slug: string;
  titulo: string;
  excerpt: string | null;
  cover_url: string | null;
  cuerpo_html: string | null;
  categoria: string | null;
  autor: string | null;
  publicado: boolean;
  publicado_at: string | null;
  destacado: boolean;
  orden: number;
};

type Draft = {
  id?: string;
  slug: string;
  titulo: string;
  excerpt: string;
  cover_url: string;
  cuerpo_html: string;
  categoria: string;
  autor: string;
  publicado: boolean;
  destacado: boolean;
  orden: number;
};

function emptyDraft(): Draft {
  return {
    slug: "",
    titulo: "",
    excerpt: "",
    cover_url: "",
    cuerpo_html: "",
    categoria: "",
    autor: "",
    publicado: false,
    destacado: false,
    orden: 0,
  };
}

function draftFromPost(p: Post): Draft {
  return {
    id: p.id,
    slug: p.slug,
    titulo: p.titulo,
    excerpt: p.excerpt ?? "",
    cover_url: p.cover_url ?? "",
    cuerpo_html: p.cuerpo_html ?? "",
    categoria: p.categoria ?? "",
    autor: p.autor ?? "",
    publicado: p.publicado,
    destacado: p.destacado,
    orden: p.orden,
  };
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function AdminWebBlogPage() {
  const t = useT();
  const { isSuperAdmin, loaded: rolLoaded } = useIsSuperAdmin();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "publicados" | "borradores">("todos");

  const categoriasSugeridas = useMemo(() => {
    const set = new Set<string>();
    for (const p of posts) {
      const c = (p.categoria ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [posts]);

  const postsFiltrados = useMemo(() => {
    return posts.filter((p) => {
      if (filtroCategoria && (p.categoria ?? "").trim() !== filtroCategoria) return false;
      if (filtroEstado === "publicados" && !p.publicado) return false;
      if (filtroEstado === "borradores" && p.publicado) return false;
      return true;
    });
  }, [posts, filtroCategoria, filtroEstado]);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/admin/web/blog", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error al cargar");
      const rows = ((j.data?.items ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c.id),
        slug: String(c.slug ?? ""),
        titulo: String(c.titulo ?? ""),
        excerpt: c.excerpt == null ? null : String(c.excerpt),
        cover_url: c.cover_url == null ? null : String(c.cover_url),
        cuerpo_html: c.cuerpo_html == null ? null : String(c.cuerpo_html),
        categoria: c.categoria == null ? null : String(c.categoria),
        autor: c.autor == null ? null : String(c.autor),
        publicado: c.publicado === true,
        publicado_at: c.publicado_at == null ? null : String(c.publicado_at),
        destacado: c.destacado === true,
        orden: Number(c.orden ?? 0),
      })) as Post[];
      setPosts(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (rolLoaded && isSuperAdmin) void cargar();
  }, [rolLoaded, isSuperAdmin]);

  async function patch(row: Post, body: Record<string, unknown>) {
    try {
      const r = await fetchWithSupabaseSession(`/api/admin/web/blog/${row.id}`, {
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

  async function eliminar(row: Post) {
    if (!window.confirm(t("¿Eliminar este post? Esta acción es permanente."))) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/admin/web/blog/${row.id}`, {
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
    const titulo = draft.titulo.trim();
    if (!titulo) {
      setError(t("El título es obligatorio."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        titulo,
        slug: draft.slug.trim() || titulo,
        excerpt: draft.excerpt.trim() || null,
        cover_url: draft.cover_url.trim() || null,
        cuerpo_html: draft.cuerpo_html.trim() || null,
        categoria: draft.categoria.trim() || null,
        autor: draft.autor.trim() || null,
        publicado: draft.publicado,
        destacado: draft.destacado,
        orden: draft.orden,
      };
      const url_endpoint = draft.id
        ? `/api/admin/web/blog/${draft.id}`
        : "/api/admin/web/blog";
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
          {t("Solo super_admin puede administrar el blog del sitio.")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Blog (web)")}</h1>
          <p className="text-sm text-slate-600">
            {t("Notas y artículos que aparecen en /blog del sitio público.")}
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
            + {t("Nuevo post")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-slate-600">{t("Estado")}</label>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
        >
          <option value="todos">{t("Todos")}</option>
          <option value="publicados">{t("Publicados")}</option>
          <option value="borradores">{t("Borradores")}</option>
        </select>
        {categoriasSugeridas.length > 0 && (
          <>
            <label className="text-xs font-medium text-slate-600 ml-2">{t("Categoría")}</label>
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
          </>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {postsFiltrados.length} {postsFiltrados.length === 1 ? t("post") : t("posts")}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">{t("Cargando…")}</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t("Todavía no hay posts. Creá el primero con «+ Nuevo post».")}
          </p>
        ) : postsFiltrados.length === 0 ? (
          <p className="text-sm text-slate-500">{t("No hay posts con esos filtros.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">{t("Cover")}</th>
                  <th className="pb-2 pr-3">{t("Título")}</th>
                  <th className="pb-2 pr-3">{t("Categoría")}</th>
                  <th className="pb-2 pr-3">{t("Publicado")}</th>
                  <th className="pb-2 pr-3 text-right">{t("Orden")}</th>
                  <th className="pb-2 pr-3 text-center">{t("Destacado")}</th>
                  <th className="pb-2 pr-3 text-center">{t("Estado")}</th>
                  <th className="pb-2 text-right">{t("Acciones")}</th>
                </tr>
              </thead>
              <tbody>
                {postsFiltrados.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3">
                      <Preview url={row.cover_url ?? ""} />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-800">{row.titulo}</div>
                      <div className="text-xs text-slate-500">/{row.slug}</div>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{row.categoria ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600 tabular-nums">
                      {formatFecha(row.publicado_at)}
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
                        onClick={() => patch(row, { publicado: !row.publicado })}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.publicado
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.publicado ? t("Publicado") : t("Borrador")}
                      </button>
                    </td>
                    <td className="py-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setDraft(draftFromPost(row))}
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
        <PostModal
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          categoriasSugeridas={categoriasSugeridas}
          onClose={() => setDraft(null)}
          onSave={guardarDraft}
        />
      )}
    </div>
  );
}

function Preview({ url }: { url: string }) {
  if (!url) return <div className="h-14 w-20 rounded-md bg-slate-100" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="preview" className="h-14 w-20 rounded-md object-cover" />;
}

function PostModal({
  draft,
  setDraft,
  saving,
  categoriasSugeridas,
  onClose,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  saving: boolean;
  categoriasSugeridas: string[];
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
        className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {draft.id ? t("Editar post") : t("Nuevo post")}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">{t("Título")}</label>
            <input
              type="text"
              value={draft.titulo}
              onChange={(e) => setDraft({ ...draft, titulo: e.target.value })}
              placeholder={t("Ej: 5 tips para organizar el placard")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">{t("Slug (URL)")}</label>
            <input
              type="text"
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              placeholder={t("Se autogenera del título si lo dejás vacío")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">{t("Cover (imagen destacada)")}</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={draft.cover_url}
                onChange={(e) => setDraft({ ...draft, cover_url: e.target.value })}
                placeholder={t("Pegá una URL o subí un archivo →")}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <WebUploadButton
                modulo="blog"
                onUploaded={(url) => setDraft({ ...draft, cover_url: url })}
                accept="image/*"
                labelIdle={t("Subir imagen")}
                labelBusy={t("Subiendo…")}
              />
            </div>
            {draft.cover_url && (
              <div className="mt-2">
                <Preview url={draft.cover_url} />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">{t("Excerpt (bajada)")}</label>
            <textarea
              value={draft.excerpt}
              onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
              rows={2}
              placeholder={t("Resumen que se muestra en la card del listado.")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">{t("Cuerpo")}</label>
            <div className="mt-1">
              <RichTextEditor
                value={draft.cuerpo_html}
                onChange={(html) => setDraft({ ...draft, cuerpo_html: html })}
                placeholder={t("Escribí acá el contenido de la nota…")}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {t("Usá los botones para dar formato: títulos, negrita, listas, imágenes y links.")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Categoría")}</label>
              <input
                type="text"
                list="blog-cat-sugeridas"
                value={draft.categoria}
                onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}
                placeholder={t("Elegí una o escribí nueva")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
              />
              <datalist id="blog-cat-sugeridas">
                {categoriasSugeridas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Autor")}</label>
              <input
                type="text"
                value={draft.autor}
                onChange={(e) => setDraft({ ...draft, autor: e.target.value })}
                placeholder={t("Equipo Akakua'a")}
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
              <p className="mt-1 text-[11px] text-slate-400">{t("Menor = primero.")}</p>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.publicado}
                  onChange={(e) => setDraft({ ...draft, publicado: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]/40"
                />
                {t("Publicado")}
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
            disabled={saving || !draft.titulo.trim()}
            className="rounded-lg bg-[#4FAEB2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40"
          >
            {saving ? t("Guardando…") : t("Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}
