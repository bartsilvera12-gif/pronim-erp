/**
 * Storage helpers para imágenes del sitio público (catálogo web + tesoros).
 *
 * Bucket: `web-imagenes` (público).
 * Path:   `{empresa_id}/{modulo}/{uuid}.{ext}` donde modulo ∈ {catalogo, tesoros}.
 *
 * Mismo patrón que `productos-imagenes` (ver src/lib/inventario/imagen-storage.ts):
 *   - Bucket público → URLs cacheables por CDN, sin firma en cada request.
 *   - Bucket "ensured" en el primer POST (idempotente).
 *   - `empresa_id` como primer segmento para aislamiento por tenant.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const WEB_IMAGENES_BUCKET = "web-imagenes";

export const ALLOWED_WEB_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);
export const ALLOWED_WEB_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
  "video/mp4":  "mp4",
  "video/webm": "webm",
};
export const MAX_WEB_BYTES = 20 * 1024 * 1024; // 20 MB (para permitir videos cortos de Tesoros)

export type WebModulo = "catalogo" | "tesoros";

/**
 * URL pública directa al objeto. Requiere que el bucket esté `public=true`
 * en `storage.buckets`. No usar signed URLs — rompen el cache del CDN en
 * el HTML público (`catalogo.html`, `index.html`).
 */
export function publicWebImagenUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return null;
  const clean = base.replace(/\/$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${clean}/storage/v1/object/public/${WEB_IMAGENES_BUCKET}/${encoded}`;
}

let bucketEnsured = false;

export async function ensureWebImagenesBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(WEB_IMAGENES_BUCKET);
    if (existing) {
      // Verificamos que sea público — si no lo es, no podríamos servir las
      // URLs desde el HTML estático. Best effort: si existe y no es público,
      // marcamos como ensured pero el admin verá URLs 401.
      bucketEnsured = true;
      return;
    }
  } catch {
    /* fallthrough */
  }
  const { error } = await supabase.storage.createBucket(WEB_IMAGENES_BUCKET, {
    public: true,
    fileSizeLimit: MAX_WEB_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_WEB_MIME),
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`No se pudo crear el bucket web-imagenes: ${error.message}`);
  }
  bucketEnsured = true;
}

export function buildWebImagenPath(
  empresaId: string,
  modulo: WebModulo,
  uuid: string,
  mime: string,
): string {
  const ext = ALLOWED_WEB_EXT[mime] ?? "bin";
  return `${empresaId}/${modulo}/${uuid}.${ext}`;
}
