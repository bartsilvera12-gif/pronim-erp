import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_WEB_MIME,
  MAX_WEB_BYTES,
  WEB_IMAGENES_BUCKET,
  buildWebImagenPath,
  ensureWebImagenesBucket,
  publicWebImagenUrl,
  type WebModulo,
} from "@/lib/web/imagen-storage";

/**
 * POST /api/admin/web/upload
 *
 * Sube un archivo (imagen o video corto) al bucket `web-imagenes` y
 * devuelve su URL pública. Karen usa esto desde el modal de
 * /admin/web/catalogo y /admin/web/tesoros para subir assets locales
 * en vez de pegar URLs manualmente.
 *
 * Body: multipart/form-data con:
 *   - file: File (image/* o video/mp4-webm, max 20 MB)
 *   - modulo: "catalogo" | "tesoros" (para organizar el path)
 *
 * Solo super_admin. Storage se accede con el JWT del usuario (rol
 * `authenticated` + policies del bucket) — mismo patrón que
 * /api/productos/[id]/imagen para no depender de service_role.
 */

function clientWithJwt(jwt: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
  });
}

function randomId(): string {
  // 12 chars alphanumeric — colisiones despreciables para uso admin.
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin puede subir archivos a la web."), { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json(errorResponse("multipart/form-data requerido."), { status: 400 });

    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json(errorResponse("Falta el archivo."), { status: 400 });
    if (file.size <= 0) return NextResponse.json(errorResponse("El archivo está vacío."), { status: 400 });
    if (file.size > MAX_WEB_BYTES) {
      return NextResponse.json(errorResponse(`El archivo supera el máximo (${Math.round(MAX_WEB_BYTES / 1024 / 1024)} MB).`), { status: 400 });
    }
    if (!ALLOWED_WEB_MIME.has(file.type)) {
      return NextResponse.json(errorResponse(`Tipo no permitido: ${file.type || "desconocido"}.`), { status: 400 });
    }

    const moduloRaw = String(form.get("modulo") ?? "catalogo").trim().toLowerCase();
    const modulo: WebModulo = moduloRaw === "tesoros" ? "tesoros" : "catalogo";

    const jwt = await getAccessTokenForRequest(request);
    const sb = clientWithJwt(jwt);
    await ensureWebImagenesBucket(sb);

    const path = buildWebImagenPath(auth.empresa_id, modulo, randomId(), file.type);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = await sb.storage.from(WEB_IMAGENES_BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) {
      console.error("[/api/admin/web/upload] storage.upload", up.error.message);
      return NextResponse.json(errorResponse(`No se pudo subir el archivo: ${up.error.message}`), { status: 500 });
    }
    const url = publicWebImagenUrl(path);
    if (!url) {
      return NextResponse.json(errorResponse("Bucket subido pero no se pudo construir la URL pública."), { status: 500 });
    }
    return NextResponse.json(successResponse({ url, path, tipo: file.type.startsWith("video/") ? "video" : "foto" }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[/api/admin/web/upload]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
