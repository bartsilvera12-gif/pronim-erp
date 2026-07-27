import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isElevatePublicHost,
  ELEVATE_PUBLIC_PREFIX,
} from "@/lib/elevate-public/hosts";

/**
 * Middleware:
 *   1. Host público (config en `ELEVATE_PUBLIC_WEB_HOSTS`) → rewrite a los
 *      HTML estáticos de la web de Akakua'a bajo `/akakuaa/pages/*.html`.
 *      La URL en el browser NO cambia. Los assets/js/css/api se sirven
 *      passthrough. Pages desconocidas devuelven 404.
 *   2. Host ERP/admin → refresh de sesión Supabase (legacy).
 *
 * Nota: la env var y helper legado siguen llamándose `ELEVATE_*` para no
 * romper la config existente en Hostinger — Karen decidió no tocarlo.
 */

// Mapa de páginas navegables del sitio Akakua'a → HTML estático en /public.
const AKAKUAA_STATIC_PAGES: Record<string, string> = {
  "/": "/akakuaa/pages/index.html",
  "/catalogo": "/akakuaa/pages/catalogo.html",
  "/historia": "/akakuaa/pages/historia.html",
  "/faq": "/akakuaa/pages/faq.html",
  "/sucursales": "/akakuaa/pages/sucursales.html",
  "/privacidad": "/akakuaa/pages/privacidad.html",
};

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const pathname = request.nextUrl.pathname;

  // Bypass para rutas que no son páginas: API, assets internos.
  const isAssetOrApi =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(pathname);

  if (isElevatePublicHost(host)) {
    if (isAssetOrApi) {
      // En hosts públicos no refrescamos sesión Supabase (no hay sesión).
      return NextResponse.next();
    }

    // Trim trailing slash (excepto "/") para hacer el match.
    const key = pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
    const target = AKAKUAA_STATIC_PAGES[key];
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      return NextResponse.rewrite(url);
    }
    return new NextResponse("Not Found", { status: 404 });
  }

  /**
   * Host NO público (ERP/admin) — bloquear el prefijo interno `/publico/*`
   * y las páginas estáticas de Akakua'a: no deben ser navegables desde el
   * dominio del ERP.
   */
  if (
    pathname === ELEVATE_PUBLIC_PREFIX ||
    pathname.startsWith(`${ELEVATE_PUBLIC_PREFIX}/`) ||
    pathname.startsWith("/akakuaa/pages/")
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // ERP/admin path — comportamiento legacy (refresh de sesión Supabase).
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}

/**
 * Matcher: excluye TODO lo que no requiere lógica de middleware.
 *
 * Excluidos:
 *   - /api/webhooks/*        (Meta sin cookies)
 *   - /api/publico/*         (catálogo público de Akakua'a, sin sesión)
 *   - /_next/static/*
 *   - /_next/image
 *   - /_next/data/*
 *   - favicon, robots, sitemap, manifest
 *   - cualquier archivo con extensión
 */
export const config = {
  matcher: [
    "/((?!api/webhooks|api/publico|_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.json|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
