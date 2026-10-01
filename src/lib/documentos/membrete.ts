/**
 * Membrete (encabezado) común para todos los documentos imprimibles del ERP.
 * Devuelve HTML con estilos inline para no depender del CSS de cada endpoint
 * (evita duplicar el markup del encabezado en cada documento).
 *
 * SOLO presentación: no toca datos de negocio. Los datos comerciales son fijos
 * de la empresa (Akakua'a — Pronim).
 */

export const EMPRESA_DOC = {
  nombre: "Akakua'a",
  actividad: [
    "Compra y venta de prendas usadas",
  ],
  telefono: "",
  /** Dirección oculta a pedido del cliente (lista vacía → no se renderiza). */
  direccion: [] as string[],
  /** Logo del cliente (alta calidad, sin fondo). Servido desde /public. */
  logoUrl: "/web/uploads/logo.PNG",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Membrete A4: logo a la izquierda, datos comerciales a la derecha, línea divisoria.
 * `origin` opcional para URL absoluta del logo (útil al imprimir/guardar PDF).
 */
export function membreteA4(origin = ""): string {
  const e = EMPRESA_DOC;
  const logo = origin ? `${origin}${e.logoUrl}` : e.logoUrl;
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:2px solid #4FAEB2;padding-bottom:12px;margin-bottom:16px;">
    <div style="flex:0 0 auto;">
      <img src="${esc(logo)}" alt="${esc(e.nombre)}" style="max-width:180px;max-height:92px;width:auto;height:auto;object-fit:contain;display:block;" />
    </div>
    <div style="flex:1;min-width:0;text-align:right;font-size:11px;color:#374151;line-height:1.55;">
      <div style="font-size:14px;font-weight:800;color:#1f2937;">${esc(e.nombre)}</div>
      ${e.actividad.map((a) => `<div style="color:#6b7280;">${esc(a)}</div>`).join("")}
      ${e.telefono ? `<div style="margin-top:4px;"><strong>Tel:</strong> ${esc(e.telefono)}</div>` : ""}
      ${e.direccion.length > 0 ? `<div>${e.direccion.map(esc).join(" · ")}</div>` : ""}
    </div>
  </div>`;
}

/**
 * Membrete compacto para ticket angosto (58/80mm): datos centrados y, si se
 * pasa `logoUrl`, el logo arriba.
 *
 * El logo se saca de la configuración del emisor, no de una constante: así
 * el ticket y la factura usan el mismo y se cambia desde la pantalla de
 * Facturación. Va en escala de grises porque la térmica es monocromo.
 */
export function membreteTicket(logoUrl?: string | null, negocio?: string | null): string {
  const e = EMPRESA_DOC;
  // El nombre lo decide quien llama (la marca de la sucursal), no la
  // constante: la misma empresa opera como Akakua'a y como Novo Outra Vez.
  const nombre = (negocio ?? "").trim() || e.nombre;
  const logo = (logoUrl ?? "").trim();
  return `
  <div style="text-align:center;padding-bottom:6px;margin-bottom:6px;border-bottom:1px dashed #000;">
    ${logo ? `<img src="${esc(logo)}" alt="" style="display:block;margin:0 auto 4px;max-height:16mm;max-width:38mm;object-fit:contain;filter:grayscale(1) contrast(1.35);" />` : ""}
    <div style="font-weight:700;font-size:13px;">${esc(nombre)}</div>
    ${e.telefono ? `<div style="font-size:10px;">Tel: ${esc(e.telefono)}</div>` : ""}
    ${e.direccion[0] ? `<div style="font-size:10px;">${esc(e.direccion[0])}</div>` : ""}
    ${e.direccion.length > 1 ? `<div style="font-size:10px;">${esc(e.direccion.slice(1).join(" · "))}</div>` : ""}
  </div>`;
}
