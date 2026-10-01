import { serializeUnknownError } from "@/lib/errors/serialize-unknown-error";
import { supabase } from "@/lib/supabase";

async function resolveAccessToken(): Promise<string | null> {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const { data: gu, error } = await supabase.auth.getUser();
  if (error || !gu.user) return null;
  ({
    data: { session },
  } = await supabase.auth.getSession());
  return session?.access_token ?? null;
}

/** fetch a rutas propias enviando el JWT de la sesión actual (localStorage); fallback cookies con credentials. */
export async function fetchWithSupabaseSession(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    const token = await resolveAccessToken();
    const pedir = async (jwt: string | null) => {
      const headers = new Headers(init?.headers);
      if (jwt) headers.set("Authorization", `Bearer ${jwt}`);
      return fetch(input, {
        ...init,
        headers,
        credentials: init?.credentials ?? "include",
      });
    };

    const res = await pedir(token);
    if (res.status !== 401) return res;

    // Un 401 casi nunca significa "no tenés permiso": lo normal es que la
    // sesión todavía no estuviera lista cuando salió el pedido (recién
    // cargó la pantalla) o que el token acabara de vencer. Antes eso se le
    // mostraba al usuario como "No autenticado" con un botón Reintentar que
    // funcionaba — justamente porque bastaba con volver a pedirlo.
    //
    // Reintentar es seguro aunque sea un POST: un 401 se rechaza antes de
    // tocar nada. Solo se omite si el body es un stream, que no se puede
    // volver a leer.
    const bodyReusable = init?.body === undefined || typeof init.body === "string";
    if (!bodyReusable) return res;

    let nuevo: string | null = null;
    try {
      const { data } = await supabase.auth.refreshSession();
      nuevo = data.session?.access_token ?? null;
    } catch { /* sin refresh: se prueba con lo que haya */ }
    if (!nuevo) nuevo = await resolveAccessToken();

    // Si no conseguimos un token distinto, el 401 es real.
    if (!nuevo || nuevo === token) return res;
    return pedir(nuevo);
  } catch (e) {
    // Preservar AbortError tal cual para que el caller pueda hacer
    //   catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; }
    // Sin esto, el wrapper Error lo enmascaraba y el caller no podia distinguir
    // un abort intencional (componente desmontado) de un fallo de red real.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(`fetchWithSupabaseSession: ${serializeUnknownError(e)}`);
  }
}

/**
 * Helper: true si el error proviene de un AbortController.
 * Sirve para llamadas que pueden venir del wrapper o de fetch nativo.
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

/** Alias: todas las llamadas a `/api/*` autenticadas desde el browser deben usar esto (JWT localStorage). */
export const apiFetch = fetchWithSupabaseSession;
