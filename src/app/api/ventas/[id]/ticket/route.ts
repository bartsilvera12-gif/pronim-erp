import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { membreteA4, membreteTicket } from "@/lib/documentos/membrete";
import {
  asignarNumeroFactura,
  leerDatosEmisor,
  type AutoimpresorEmpresa,
} from "@/lib/facturacion/server/autoimpresor-sucursal-pg";
import { montoEnLetrasGs } from "@/lib/facturacion/monto-en-letras";
import { qrComprobanteDataUri } from "@/lib/documentos/qr";

/**
 * GET /api/ventas/[id]/ticket?w=58|80&mode=comandas&auto=1&factura=1
 *
 * HTML imprimible NO FISCAL. Soporta dos modos:
 *
 * - Default (sin `mode`): una sola copia tipo CLIENTE.
 * - `mode=comandas`: genera múltiples copias en una sola página HTML separadas por
 *   page-break-after, calculadas automáticamente según las categorías/SKUs de los
 *   productos de la venta:
 *     · Siempre: copia CLIENTE (con precios, total, método de pago, leyenda no fiscal).
 *     · Si hay pizzas/lompizzas: copia COMANDA PIZZERÍA (sin precios).
 *     · Si hay hamburguesas/lomitos/lomitos árabes/panchos/papas/especiales: copia COMANDA PLANCHA.
 *
 * Con `factura=1` imprime la FACTURA del autoimpresor: cabecera con RUC y
 * timbrado, número correlativo del establecimiento, liquidación de IVA e
 * importe en letras. Sin ese parámetro sigue siendo el comprobante interno.
 *
 * No toca SIFEN ni genera XML.
 */

/**
 * Nombre del negocio en el ticket. Orden de preferencia:
 *   1) sucursales.nombre_comercial de la sucursal de la venta
 *   2) process.env.NEURA_CLIENT_NAME (instancia dedicada monocliente)
 *   3) empresas.nombre_empresa de la empresa de la venta
 *   4) fallback seguro
 *
 * La sucursal va primero porque una misma empresa puede operar con dos
 * marcas: Akakua'a en Paraguay y Novo Outra Vez en Brasil. El ticket tiene
 * que salir con la marca del local donde se vendió.
 */
const NEGOCIO_FALLBACK = "Akakua'a";

function resolveNegocio(nombreEmpresa?: string | null, marcaSucursal?: string | null): string {
  const m = (marcaSucursal ?? "").trim();
  if (m) return m;
  const env = (process.env.NEURA_CLIENT_NAME ?? "").trim();
  if (env) return env;
  const e = (nombreEmpresa ?? "").trim();
  if (e) return e;
  return NEGOCIO_FALLBACK;
}

// ── Clasificación PIZZERÍA / PLANCHA ───────────────────────────────────────
// Primary: categoría hija del producto. Fallback: prefijo de SKU.

const CAT_SLUGS_PIZZERIA = new Set(["pizzas", "lompizzas"]);
const CAT_SLUGS_PLANCHA = new Set([
  "hamburguesas",
  "lomitos",
  "lomitos_arabes",
  "panchos",
  "papas_fritas",
  "especiales",
]);
const CAT_NOMBRES_PIZZERIA = new Set(["PIZZAS", "LOMPIZZAS"]);
const CAT_NOMBRES_PLANCHA = new Set([
  "HAMBURGUESAS",
  "LOMITOS",
  "LOMITOS ARABES",
  "LOMITOS ÁRABES",
  "PANCHOS",
  "PAPAS FRITAS",
  "ESPECIALES",
]);

type Sector = "pizzeria" | "plancha" | null;

function classifyBySku(sku: string): Sector {
  const s = (sku || "").toUpperCase();
  if (s.startsWith("PIZ-")) return "pizzeria";
  if (s.startsWith("ESP-")) return "plancha";
  if (s.startsWith("HAM-") || s.startsWith("LOM-") || s.startsWith("PAN-") || s.startsWith("PAP-")) return "plancha";
  return null;
}

function classifyByCategoria(slug: string | null, nombre: string | null): Sector {
  const sl = (slug || "").toLowerCase();
  const nm = (nombre || "").toUpperCase();
  if (sl && CAT_SLUGS_PIZZERIA.has(sl)) return "pizzeria";
  if (sl && CAT_SLUGS_PLANCHA.has(sl)) return "plancha";
  if (nm && CAT_NOMBRES_PIZZERIA.has(nm)) return "pizzeria";
  if (nm && CAT_NOMBRES_PLANCHA.has(nm)) return "plancha";
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatGs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

/** dd/mm/aaaa a partir de un YYYY-MM-DD, sin pasar por Date (no hay TZ que valga). */
function fechaCorta(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(ymd);
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

/**
 * Nombre corto para el ticket. Las franjas de precio se llaman
 * "Prenda - Categoría Gs. 6.000"; en un papel de 58/80mm ese prefijo ocupa dos
 * líneas y es redundante con la columna de importe. Se recorta solo si aparece.
 */
function nombreCorto(nombre: string): string {
  return (nombre || "")
    .replace(/^\s*prenda\s*[-–]\s*categor[íi]a\s*/i, "")
    .trim() || nombre;
}

/**
 * Agrupa líneas idénticas (mismo producto y mismo precio unitario) sumando
 * cantidades e importes, para que el ticket muestre "cuántas prendas de cada
 * monto" en una sola línea en vez de repetir la misma franja varias veces.
 */
function agruparItems(items: EnrichedItem[]): EnrichedItem[] {
  const map = new Map<string, EnrichedItem>();
  for (const it of items) {
    const key = `${it.producto_id}|${Number(it.precio_venta)}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...it, cantidad: Number(it.cantidad), total_linea: Number(it.total_linea) });
    } else {
      prev.cantidad = Number(prev.cantidad) + Number(it.cantidad);
      prev.total_linea = Number(prev.total_linea) + Number(it.total_linea);
    }
  }
  // Más caras primero: es como la clienta lee el ticket.
  return [...map.values()].sort((a, b) => Number(b.precio_venta) - Number(a.precio_venta));
}

function modalidadLabel(m: string | null | undefined): string {
  if (m === "local") return "Local";
  if (m === "delivery") return "Delivery";
  if (m === "carry_out") return "Retiro";
  return "";
}

function metodoPagoLabel(m: string | null | undefined): string {
  if (m === "tarjeta") return "Tarjeta";
  if (m === "transferencia") return "Transferencia";
  if (m === "efectivo") return "Efectivo";
  return "—";
}

// ── Types ──────────────────────────────────────────────────────────────────

interface VentaRow {
  id: string;
  numero_control: string;
  fecha: string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  observaciones: string | null;
  metodo_pago: string | null;
  cliente_id: string | null;
  /** Sucursal donde se vendió: define la marca y el logo del comprobante. */
  sucursal_id?: string | null;
  /** Número ya asignado por el autoimpresor. Si está, se reimprime la factura. */
  factura_numero?: string | null;
  /** Columnas opcionales: joyería no usa remisión, quedan en null. */
  genera_nota_remision?: boolean | null;
  nota_remision_numero?: string | null;
}

/** Todo lo que la factura impresa necesita además de la venta. */
interface DatosFactura {
  numero: string;
  emisor: AutoimpresorEmpresa;
  cliente_nombre: string | null;
  cliente_documento: string | null;
  /** Acumulado por tasa, para la liquidación del IVA del pie. */
  gravado5: number;
  gravado10: number;
  exentas: number;
  iva5: number;
  iva10: number;
}

interface ItemRow {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number | string;
  precio_venta: number | string;
  total_linea: number | string;
  /** EXENTA | 5% | 10%. Solo se usa para la liquidación de la factura. */
  tipo_iva?: string | null;
  subtotal?: number | string | null;
  monto_iva?: number | string | null;
}

type EnrichedItem = ItemRow & { sector: Sector };

interface PedidoBrief {
  modalidad?: "local" | "delivery" | "carry_out";
  mesa?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  observacion?: string | null;
}

// ── Render de cada copia ───────────────────────────────────────────────────

function renderCopia(opts: {
  tipo: "cliente" | "pizzeria" | "plancha";
  venta: VentaRow;
  items: EnrichedItem[];
  brief: PedidoBrief | null;
  fontPx: number;
  isLast: boolean;
  negocio: string;
  /** Presente solo cuando se pidió ?factura=1 y la sucursal factura. */
  factura?: DatosFactura | null;
  /** Logo del emisor, también para el ticket interno. */
  logoUrl?: string | null;
  /** Dirección y teléfono DEL LOCAL donde se vendió. */
  contacto?: { direccion?: string | null; telefono?: string | null };
  /** QR de la tienda (data URI), al pie de la factura. */
  qrDataUri?: string | null;
}): string {
  const { tipo, venta, brief, fontPx, isLast } = opts;
  const factura = opts.factura ?? null;
  const showPrices = tipo === "cliente";
  const sectorBadge = tipo === "pizzeria" ? "COMANDA PIZZERÍA" : tipo === "plancha" ? "COMANDA PLANCHA" : "";
  const modalidad = modalidadLabel(brief?.modalidad);

  // Se agrupan las líneas repetidas del mismo producto/precio para que quede
  // "N prendas de tal monto" en una sola línea.
  const items = agruparItems(opts.items);
  const totalUnidades = items.reduce((s, it) => s + Number(it.cantidad), 0);

  // Filas de ítems: en cliente todas; en cocina todas también, pero las del propio sector destacadas.
  const itemsHtml = items
    .map((it) => {
      const cant = Number(it.cantidad);
      const punit = Number(it.precio_venta);
      const sub = Number(it.total_linea);
      const matchesSector =
        (tipo === "pizzeria" && it.sector === "pizzeria") ||
        (tipo === "plancha" && it.sector === "plancha");
      const cls = matchesSector ? "match" : tipo === "cliente" ? "" : "muted";
      const main = showPrices
        ? `<tr class="${cls}">
             <td class="qty"><strong>${cant}×</strong></td>
             <td class="name">${escapeHtml(nombreCorto(it.producto_nombre))}</td>
             <td class="amt">${formatGs(sub)}</td>
           </tr>
           <tr class="sub"><td></td><td colspan="2">${cant} × ${formatGs(punit)} c/u</td></tr>`
        : `<tr class="${cls}">
             <td class="qty"><strong>${cant}×</strong></td>
             <td class="name" colspan="2"><strong>${escapeHtml(it.producto_nombre)}</strong></td>
           </tr>`;
      return main;
    })
    .join("");

  // Si la venta no tiene líneas cargadas, se dice explícitamente en vez de
  // imprimir un ticket con un hueco en blanco.
  const detalleHtml = items.length > 0
    ? `<table><tbody>${itemsHtml}</tbody></table>`
    : `<div class="sin-items">Sin detalle de prendas cargado.</div>`;

  const subtotal = Number(venta.subtotal);
  const ivaTotal = Number(venta.monto_iva);
  const total = Number(venta.total);

  const datosPedido: string[] = [];
  if (modalidad) {
    datosPedido.push(
      `<div><strong>${modalidad}</strong>${brief?.mesa ? ` · Mesa ${escapeHtml(brief.mesa)}` : ""}</div>`
    );
  }
  if (brief?.cliente_nombre) datosPedido.push(`<div>Cliente: ${escapeHtml(brief.cliente_nombre)}</div>`);
  if (brief?.cliente_telefono) datosPedido.push(`<div>Tel: ${escapeHtml(brief.cliente_telefono)}</div>`);
  if (brief?.direccion_entrega) datosPedido.push(`<div>Dir: ${escapeHtml(brief.direccion_entrega)}</div>`);
  const obs = brief?.observacion || venta.observaciones || "";

  const headerCocina = sectorBadge
    ? `<div class="sector-banner">${sectorBadge}</div>`
    : "";
  const totalesHtml = showPrices
    ? `<hr>
       <table class="totales">
         <tbody>
           ${totalUnidades > 0
             ? `<tr><td class="lbl">Prendas</td><td class="val">${totalUnidades}</td></tr>`
             : ""}
           <tr><td class="lbl">Subtotal</td><td class="val">${formatGs(subtotal)}</td></tr>
           ${ivaTotal > 0 ? `<tr><td class="lbl">IVA</td><td class="val">${formatGs(ivaTotal)}</td></tr>` : ""}
           <tr class="total-row"><td class="lbl">TOTAL</td><td class="val">${formatGs(total)}</td></tr>
           <tr><td class="lbl">Pago</td><td class="val">${metodoPagoLabel(venta.metodo_pago)}</td></tr>
         </tbody>
       </table>`
    : "";
  // Liquidación del IVA + importe en letras: los dos son obligatorios en la
  // factura impresa paraguaya.
  const liquidacionHtml = factura
    ? `<hr>
       <table class="totales">
         <tbody>
           ${factura.exentas > 0 ? `<tr><td class="lbl">Exentas</td><td class="val">${formatGs(factura.exentas)}</td></tr>` : ""}
           ${factura.gravado5 > 0 ? `<tr><td class="lbl">Gravado 5%</td><td class="val">${formatGs(factura.gravado5)}</td></tr>` : ""}
           ${factura.gravado10 > 0 ? `<tr><td class="lbl">Gravado 10%</td><td class="val">${formatGs(factura.gravado10)}</td></tr>` : ""}
           ${factura.iva5 > 0 ? `<tr><td class="lbl">IVA 5%</td><td class="val">${formatGs(factura.iva5)}</td></tr>` : ""}
           ${factura.iva10 > 0 ? `<tr><td class="lbl">IVA 10%</td><td class="val">${formatGs(factura.iva10)}</td></tr>` : ""}
           <tr><td class="lbl">Total IVA</td><td class="val">${formatGs(factura.iva5 + factura.iva10)}</td></tr>
         </tbody>
       </table>
       <div class="letras">Son: ${escapeHtml(montoEnLetrasGs(total))}</div>`
    : "";

  // El QR va arriba del saludo y debajo de todo lo fiscal, para no
  // meterse entre los datos que la factura tiene que llevar sí o sí.
  const qrHtml = opts.qrDataUri
    ? `<div class="qr"><img src="${opts.qrDataUri}" alt="" /></div>`
    : "";

  const footerHtml = factura
    ? `<hr>
       ${qrHtml}
       <div class="footer">
         ¡Gracias por tu compra!
       </div>`
    : showPrices
    ? `<hr>
       <div class="footer">
         ¡Gracias por tu compra!<br>
         Comprobante interno — no válido como factura legal.
       </div>`
    : `<div class="footer-cocina">${formatFecha(venta.fecha)}</div>`;

  // Cabecera fiscal: reemplaza al membrete común cuando es factura.
  const e = factura?.emisor;
  const cabeceraFiscal = factura && e
    ? `<div class="fiscal-head">
         ${e.logo_url ? `<img class="logo" src="${escapeHtml(e.logo_url)}" alt="">` : ""}
         <div class="razon">${escapeHtml(e.razon_social_emisor ?? opts.negocio)}</div>
         ${e.nombre_fantasia ? `<div class="fantasia">${escapeHtml(e.nombre_fantasia)}</div>` : ""}
         ${(() => {
           // Dirección del ESTABLECIMIENTO que emite, no la de la matriz:
           // cada establecimiento está declarado con la suya ante la SET.
           const d = (opts.contacto?.direccion ?? e.direccion_matriz ?? "").trim();
           return d ? `<div>${escapeHtml(d)}</div>` : "";
         })()}
         ${(() => {
           const t2 = (opts.contacto?.telefono ?? e.telefono ?? "").trim();
           return t2 ? `<div>Tel: ${escapeHtml(t2)}</div>` : "";
         })()}
         <div>RUC: ${escapeHtml(e.ruc_emisor ?? "—")}</div>
         <div class="timbrado">
           Timbrado N° ${escapeHtml(e.timbrado_numero ?? "—")}<br>
           Vigencia ${escapeHtml(fechaCorta(e.timbrado_inicio_vigencia))} al ${escapeHtml(fechaCorta(e.timbrado_fin_vigencia))}
         </div>
         <div class="doc-tipo">FACTURA</div>
         <div class="doc-nro">${escapeHtml(factura.numero)}</div>
       </div>
       <hr>
       <div class="fiscal-cliente">
         <div>Fecha: ${formatFecha(venta.fecha)}</div>
         <div>Cliente: ${escapeHtml(factura.cliente_nombre || "SIN NOMBRE")}</div>
         <div>RUC/CI: ${escapeHtml(factura.cliente_documento || "X")}</div>
         <div>Condición: CONTADO</div>
       </div>`
    : "";

  return `<section class="paper ${isLast ? "last" : ""}">
    ${cabeceraFiscal || headerCocina || membreteTicket(opts.logoUrl, opts.negocio, opts.contacto)}
    ${factura ? "" : `<div class="meta">
      ${escapeHtml(venta.numero_control)}<br>
      ${formatFecha(venta.fecha)}
    </div>`}
    ${datosPedido.length > 0 ? `<hr><div class="pedido">${datosPedido.join("")}</div>` : ""}
    <hr>
    ${detalleHtml}
    ${totalesHtml}
    ${liquidacionHtml}
    ${factura ? `<div class="ref-interna">Ref. interna: ${escapeHtml(venta.numero_control)}</div>` : ""}
    ${obs ? `<hr><div class="obs"><strong>Obs:</strong> ${escapeHtml(obs)}</div>` : ""}
    ${footerHtml}
  </section>`;
}

// ── Nota de remisión (documento NO fiscal) ─────────────────────────────────

interface ClienteRemision {
  nombre: string | null;
  ruc: string | null;
  documento: string | null;
  direccion: string | null;
  ciudad: string | null;
}

/** HTML imprimible de Nota de Remisión. Por defecto NO muestra precios (solo productos y cantidades). */
function renderNotaRemision(opts: {
  negocio: string;
  venta: VentaRow;
  items: Array<ItemRow & { unidad: string }>;
  cliente: ClienteRemision | null;
}): string {
  const { negocio, venta, items, cliente } = opts;
  const numeroNota = venta.nota_remision_numero || "—";
  const filas = items
    .map(
      (it) => `<tr>
        <td class="cant">${Number(it.cantidad)}</td>
        <td class="uni">${escapeHtml(it.unidad || "UNIDAD")}</td>
        <td class="desc">${escapeHtml(it.producto_nombre)}<span class="sku">${escapeHtml(it.sku)}</span></td>
      </tr>`
    )
    .join("");
  const cli = cliente
    ? [
        `<div><strong>${escapeHtml(cliente.nombre || "—")}</strong></div>`,
        cliente.ruc ? `<div>RUC: ${escapeHtml(cliente.ruc)}</div>` : "",
        !cliente.ruc && cliente.documento ? `<div>Documento: ${escapeHtml(cliente.documento)}</div>` : "",
        cliente.direccion ? `<div>Dirección: ${escapeHtml(cliente.direccion)}</div>` : "",
        cliente.ciudad ? `<div>Ciudad: ${escapeHtml(cliente.ciudad)}</div>` : "",
      ].filter(Boolean).join("")
    : `<div>—</div>`;
  const obs = venta.observaciones ? `<div class="obs"><strong>Observación:</strong> ${escapeHtml(venta.observaciones)}</div>` : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Nota de remisión ${escapeHtml(numeroNota)} — ${escapeHtml(negocio)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; color:#111; background:#f1f1f1; margin:0; padding:24px; }
  .doc { background:#fff; max-width:720px; margin:0 auto; padding:28px 32px; box-shadow:0 1px 6px rgba(0,0,0,.12); }
  h1 { font-size:18px; text-align:center; letter-spacing:1px; margin:0 0 2px; }
  .titulo { text-align:center; font-weight:800; font-size:15px; border:2px solid #111; padding:6px; margin:12px 0 16px; letter-spacing:2px; }
  .row { display:flex; justify-content:space-between; gap:24px; font-size:13px; margin-bottom:14px; }
  .box { flex:1; border:1px solid #ddd; border-radius:8px; padding:10px 12px; }
  .box h3 { margin:0 0 6px; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#666; }
  table { width:100%; border-collapse:collapse; font-size:13px; margin-top:8px; }
  th,td { border:1px solid #ddd; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f6f6f6; font-size:11px; text-transform:uppercase; letter-spacing:.5px; }
  td.cant, td.uni, th.cant, th.uni { text-align:center; width:64px; white-space:nowrap; }
  td.desc .sku { display:block; font-size:11px; color:#888; font-family:ui-monospace,monospace; }
  .obs { font-size:12px; margin-top:12px; }
  .legal { margin-top:18px; font-size:11px; color:#555; border-top:1px dashed #bbb; padding-top:10px; }
  @media print { body { background:#fff; padding:0; } .doc { box-shadow:none; max-width:none; } }
</style></head>
<body><div class="doc">
  ${membreteA4()}
  <div class="titulo">NOTA DE REMISIÓN</div>
  <div class="row">
    <div class="box"><h3>Documento</h3>
      <div><strong>N°:</strong> ${escapeHtml(numeroNota)}</div>
      <div><strong>Fecha:</strong> ${escapeHtml(formatFecha(venta.fecha))}</div>
      <div><strong>Venta:</strong> ${escapeHtml(venta.numero_control)}</div>
    </div>
    <div class="box"><h3>Cliente</h3>${cli}</div>
  </div>
  <table>
    <thead><tr><th class="cant">Cant.</th><th class="uni">Unidad</th><th>Descripción</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  ${obs}
  <div class="legal">Documento no fiscal. Emitido para acompañar la entrega de mercaderías.</div>
</div>
<script>try{ if (new URL(location.href).searchParams.get('auto')==='1') window.print(); }catch(e){}</script>
</body></html>`;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const url = new URL(request.url);
  const wParam = url.searchParams.get("w");
  const widthMm = wParam === "58" ? 58 : 80;
  const fontPx = widthMm === 58 ? 11 : 12;
  const modeComandas = url.searchParams.get("mode") === "comandas";
  const esRemision = url.searchParams.get("tipo") === "remision" || url.searchParams.get("mode") === "remision";
  // ?factura=1 → FACTURA del autoimpresor (consume un número del rango).
  const pidenFactura = url.searchParams.get("factura") === "1";

  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const empresaId = ctx.auth.empresa_id;

  // Venta
  const COLS_BASE = "id, numero_control, fecha, subtotal, monto_iva, total, observaciones, metodo_pago, cliente_id, sucursal_id";
  // `factura_numero` es de la migración del autoimpresor. En un deploy que
  // todavía no la aplicó, pedirla rompe el SELECT entero — así que si falla
  // se reintenta sin ella y el ticket sigue saliendo.
  let vQ = await ctx.supabase
    .from("ventas")
    .select(`${COLS_BASE}, factura_numero`)
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (vQ.error) {
    vQ = await ctx.supabase
      .from("ventas")
      .select(COLS_BASE)
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
  }
  if (vQ.error) return new NextResponse(`Error: ${vQ.error.message}`, { status: 500 });
  if (!vQ.data) return new NextResponse("Venta no encontrada", { status: 404 });
  const venta = vQ.data as unknown as VentaRow;

  // Nombre del negocio para el encabezado (env → empresa → fallback). Nunca hardcode.
  let nombreEmpresa: string | null = null;
  try {
    const eQ = await ctx.supabase
      .from("empresas")
      .select("nombre_empresa")
      .eq("id", empresaId)
      .maybeSingle();
    nombreEmpresa = (eQ.data as { nombre_empresa?: string | null } | null)?.nombre_empresa ?? null;
  } catch {
    nombreEmpresa = null;
  }
  // Marca de la sucursal (Akakua'a en PY, Novo Outra Vez en BR) y su logo.
  // Si la migración todavía no corrió, la consulta falla y se sigue con la
  // marca de la empresa, como antes.
  let marcaSucursal: string | null = null;
  let logoSucursal: string | null = null;
  let dirSucursal: string | null = null;
  let telSucursal: string | null = null;
  if (venta.sucursal_id) {
    try {
      const sQ = await ctx.supabase
        .from("sucursales")
        .select("nombre_comercial, logo_url, direccion, telefono")
        .eq("id", venta.sucursal_id)
        .maybeSingle();
      const row = sQ.data as {
        nombre_comercial?: string | null; logo_url?: string | null;
        direccion?: string | null; telefono?: string | null;
      } | null;
      marcaSucursal = (row?.nombre_comercial ?? null) || null;
      logoSucursal = (row?.logo_url ?? null) || null;
      dirSucursal = (row?.direccion ?? null) || null;
      telSucursal = (row?.telefono ?? null) || null;
    } catch { /* sin columnas: se usa la marca de la empresa */ }
  }
  const negocio = resolveNegocio(nombreEmpresa, marcaSucursal);

  // Items
  const iQ = await ctx.supabase
    .from("ventas_items")
    .select("producto_id, producto_nombre, sku, cantidad, precio_venta, total_linea, tipo_iva, subtotal, monto_iva")
    .eq("venta_id", id)
    .eq("empresa_id", empresaId);
  if (iQ.error) return new NextResponse(`Error items: ${iQ.error.message}`, { status: 500 });
  const itemsRaw = (iQ.data ?? []) as unknown as ItemRow[];

  // ── Nota de remisión: documento separado (no fiscal). Solo productos + cantidades.
  if (esRemision) {
    // Unidades de medida por producto.
    const prodIds = [...new Set(itemsRaw.map((i) => i.producto_id))];
    const unidadByProd = new Map<string, string>();
    if (prodIds.length > 0) {
      const uQ = await ctx.supabase
        .from("productos")
        .select("id, unidad_medida")
        .eq("empresa_id", empresaId)
        .in("id", prodIds);
      for (const r of (uQ.data ?? []) as Array<{ id: string; unidad_medida: string | null }>) {
        unidadByProd.set(r.id, r.unidad_medida ?? "UNIDAD");
      }
    }
    // Cliente (si la venta tiene cliente_id).
    let clienteRem: ClienteRemision | null = null;
    if (venta.cliente_id) {
      const cQ = await ctx.supabase
        .from("clientes")
        .select("empresa, nombre, nombre_contacto, ruc, documento, direccion, ciudad")
        .eq("id", venta.cliente_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      const c = cQ.data as Record<string, string | null> | null;
      if (c) {
        const s = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);
        clienteRem = {
          nombre: s(c.empresa) || s(c.nombre_contacto) || s(c.nombre),
          ruc: s(c.ruc),
          documento: s(c.documento),
          direccion: s(c.direccion),
          ciudad: s(c.ciudad),
        };
      }
    }
    const itemsRem = itemsRaw.map((it) => ({ ...it, unidad: unidadByProd.get(it.producto_id) ?? "UNIDAD" }));
    const htmlRem = renderNotaRemision({ negocio, venta, items: itemsRem, cliente: clienteRem });
    return new NextResponse(htmlRem, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Pedido cocina (opcional) — busca card de Pedidos vinculada a esta venta.
  let brief: PedidoBrief | null = null;
  try {
    const pQ = await ctx.supabase
      .from("proyectos")
      .select("brief_data")
      .eq("empresa_id", empresaId)
      .filter("metadata->>venta_id", "eq", id)
      .limit(1)
      .maybeSingle();
    if (!pQ.error && pQ.data) {
      brief = (pQ.data as { brief_data: PedidoBrief }).brief_data ?? null;
    }
  } catch {
    brief = null;
  }

  // Clasificación por categoría (primary) + SKU (fallback)
  const productoIds = [...new Set(itemsRaw.map((i) => i.producto_id))];
  const sectorByProd = new Map<string, Sector>();
  if (productoIds.length > 0) {
    try {
      // producto_categorias[principal] -> categorias_productos(slug, nombre)
      const pcQ = await ctx.supabase
        .from("producto_categorias")
        .select("producto_id, categoria_id, es_principal")
        .eq("empresa_id", empresaId)
        .in("producto_id", productoIds);
      const pcRows = (pcQ.data ?? []) as Array<{
        producto_id: string;
        categoria_id: string;
        es_principal: boolean | null;
      }>;
      const catIds = [...new Set(pcRows.map((r) => r.categoria_id))];
      const catMap = new Map<string, { slug: string | null; nombre: string | null }>();
      if (catIds.length > 0) {
        const cQ = await ctx.supabase
          .from("categorias_productos")
          .select("id, slug, nombre")
          .eq("empresa_id", empresaId)
          .in("id", catIds);
        for (const c of (cQ.data ?? []) as Array<{ id: string; slug: string | null; nombre: string | null }>) {
          catMap.set(c.id, { slug: c.slug ?? null, nombre: c.nombre ?? null });
        }
      }
      // Priorizamos la categoría es_principal=true; si no, la primera que matchee.
      for (const pid of productoIds) {
        const myCats = pcRows.filter((r) => r.producto_id === pid);
        const order = [...myCats].sort((a, b) => (a.es_principal ? -1 : 1) - (b.es_principal ? -1 : 1));
        let s: Sector = null;
        for (const r of order) {
          const meta = catMap.get(r.categoria_id);
          s = classifyByCategoria(meta?.slug ?? null, meta?.nombre ?? null);
          if (s) break;
        }
        sectorByProd.set(pid, s);
      }
    } catch {
      // ignoramos errores de categorías; cae al fallback por SKU.
    }
  }

  const items: EnrichedItem[] = itemsRaw.map((it) => {
    const fromCat = sectorByProd.get(it.producto_id) ?? null;
    const sector: Sector = fromCat ?? classifyBySku(it.sku);
    return { ...it, sector };
  });

  // Decidir qué copias imprimir
  const hayPizzeria = items.some((i) => i.sector === "pizzeria");
  const hayPlancha = items.some((i) => i.sector === "plancha");

  const copias: Array<"cliente" | "pizzeria" | "plancha"> = ["cliente"];
  if (modeComandas) {
    if (hayPizzeria) copias.push("pizzeria");
    if (hayPlancha) copias.push("plancha");
  }

  // El logo sale de la configuración del emisor y se usa en los dos
  // comprobantes. Si no hay config (o falla), el ticket va sin logo.
  const emisorCfg = await leerDatosEmisor(empresaId).catch(() => null);
  // El logo de la sucursal manda sobre el del emisor: son marcas distintas.
  const logoUrl = logoSucursal ?? emisorCfg?.logo_url ?? null;

  // ── Factura del autoimpresor ─────────────────────────────────────────
  // Solo si la pidieron explícitamente: asignar el número consume uno del
  // rango autorizado, así que no pasa por accidente al ver el ticket.
  // Una venta que YA se facturó se reimprime como factura, con el mismo
  // número: si saliera el ticket interno, el cliente tendría dos papeles
  // distintos de la misma compra. Reimprimir no consume numeración —
  // asignarNumeroFactura devuelve el número existente sin tocar el contador.
  const yaFacturada = Boolean(venta.factura_numero);
  let factura: DatosFactura | null = null;
  if (pidenFactura || yaFacturada) {
    /** Frena con un mensaje solo si la factura se pidió a propósito. */
    const noSePudo = (motivo: string) =>
      pidenFactura
        ? new NextResponse(motivo, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } })
        : null;

    let asignado = null;
    let fallo: NextResponse | null = null;
    try {
      asignado = await asignarNumeroFactura(empresaId, id);
    } catch (e) {
      // El caso típico: se agotó el rango autorizado.
      fallo = noSePudo(e instanceof Error ? e.message : "No se pudo emitir la factura.");
    }
    if (fallo) return fallo;

    const emisor = asignado ? emisorCfg : null;
    if (!asignado) {
      const r = noSePudo("Esta sucursal no emite factura con timbrado. Revisá Configuración → Facturación.");
      if (r) return r;
    } else if (!emisor) {
      const r = noSePudo("Faltan los datos del emisor (RUC, razón social, timbrado). Cargalos en Configuración → Facturación.");
      if (r) return r;
    }

    if (asignado && emisor) {
    // Liquidación por tasa. Si la línea no trae el desglose (ventas viejas),
    // se cae al total de la cabecera para no imprimir ceros.
    let gravado5 = 0, gravado10 = 0, exentas = 0, iva5 = 0, iva10 = 0;
    for (const it of itemsRaw) {
      const base = Number(it.subtotal ?? 0) || 0;
      const iva = Number(it.monto_iva ?? 0) || 0;
      const tasa = String(it.tipo_iva ?? "").trim();
      if (tasa === "5%") { gravado5 += base; iva5 += iva; }
      else if (tasa === "10%") { gravado10 += base; iva10 += iva; }
      else exentas += base || Number(it.total_linea) || 0;
    }

    // Datos del comprador. Sin cliente asociado va como consumidor final.
    let clienteNombre: string | null = null;
    let clienteDoc: string | null = null;
    if (venta.cliente_id) {
      try {
        const cQ = await ctx.supabase
          .from("clientes")
          .select("nombre, nombre_contacto, empresa, ruc, documento")
          .eq("id", venta.cliente_id)
          .eq("empresa_id", empresaId)
          .maybeSingle();
        const c = cQ.data as Record<string, string | null> | null;
        if (c) {
          clienteNombre = (c.empresa || c.nombre_contacto || c.nombre || "").trim() || null;
          clienteDoc = (c.ruc || c.documento || "").trim() || null;
        }
      } catch { /* sin datos del cliente: va como consumidor final */ }
    }

      factura = {
        numero: asignado.numero,
        emisor,
        cliente_nombre: clienteNombre ?? "CONSUMIDOR FINAL",
        cliente_documento: clienteDoc,
        gravado5, gravado10, exentas, iva5, iva10,
      };
    }
  }

  // Solo en la factura: el ticket interno sigue como estaba.
  const qrDataUri = factura ? await qrComprobanteDataUri() : null;

  const seccionesHtml = copias
    .map((tipo, idx) =>
      renderCopia({
        tipo, venta, items, brief, fontPx,
        isLast: idx === copias.length - 1,
        negocio, factura, logoUrl, qrDataUri,
        contacto: { direccion: dirSucursal, telefono: telSucursal },
      })
    )
    .join("");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Ticket ${escapeHtml(venta.numero_control)} — ${escapeHtml(negocio)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, "Courier New", monospace; font-size: ${fontPx}px; color: #000; background: #f1f1f1; margin: 0; padding: 20px; }
  .paper { background: #fff; width: ${widthMm}mm; margin: 0 auto 12mm; padding: 6mm 4mm; box-shadow: 0 1px 4px rgba(0,0,0,0.1); page-break-after: always; break-after: page; }
  .paper.last { page-break-after: auto; break-after: auto; margin-bottom: 0; }
  h1 { font-size: ${fontPx + 4}px; text-align: center; margin: 0 0 2mm; letter-spacing: 1px; }
  .sector-banner { font-size: ${fontPx + 6}px; font-weight: 800; text-align: center; padding: 2mm; border: 2px solid #000; margin: 0 0 3mm; letter-spacing: 1px; }
  .meta { font-size: ${fontPx - 1}px; text-align: center; margin: 1mm 0 2mm; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  .pedido { font-size: ${fontPx}px; margin: 1mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0.5mm 0; }
  td.qty { width: 9mm; }
  td.amt { width: 22mm; text-align: right; white-space: nowrap; }
  tr.sub td { color: #555; font-size: ${fontPx - 2}px; padding-bottom: 1mm; }
  tr.muted td { color: #777; font-style: italic; }
  tr.match td { background: #fffbcc; }
  .totales td { padding: 0.7mm 0; }
  .totales .lbl { text-align: left; }
  .totales .val { text-align: right; white-space: nowrap; }
  .total-row { font-weight: bold; font-size: ${fontPx + 2}px; border-top: 1px solid #000; }
  .sin-items { font-size: ${fontPx - 1}px; text-align: center; font-style: italic; padding: 2mm 0; }
  .obs { font-size: ${fontPx - 1}px; margin: 2mm 0; }
  .footer { font-size: ${fontPx - 2}px; text-align: center; margin-top: 3mm; font-style: italic; }
  .fiscal-head { text-align: center; font-size: ${fontPx - 1}px; line-height: 1.35; }
  .fiscal-head .logo { display: block; margin: 0 auto 2mm; max-height: 18mm; max-width: 40mm; object-fit: contain; filter: grayscale(1) contrast(1.35); }
  .fiscal-head .razon { font-size: ${fontPx + 2}px; font-weight: 800; letter-spacing: 0.5px; }
  .fiscal-head .fantasia { font-weight: 600; }
  .fiscal-head .timbrado { margin-top: 1.5mm; }
  .fiscal-head .doc-tipo { margin-top: 2mm; font-size: ${fontPx + 2}px; font-weight: 800; letter-spacing: 2px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1mm 0; }
  .fiscal-head .doc-nro { font-size: ${fontPx + 3}px; font-weight: 800; letter-spacing: 1px; margin-top: 1mm; }
  .fiscal-cliente { font-size: ${fontPx - 1}px; line-height: 1.4; }
  .letras { font-size: ${fontPx - 2}px; margin-top: 2mm; text-transform: uppercase; }
  /* image-rendering: pixelated para que la termica no interpole los
     modulos del QR y quede ilegible al escanear. */
  .qr { text-align: center; margin: 2mm 0 1mm; }
  .qr img { display: block; margin: 0 auto; width: 22mm; height: 22mm; image-rendering: pixelated; }
  .ref-interna { font-size: ${fontPx - 3}px; text-align: right; color: #555; margin-top: 2mm; }
  .footer-cocina { font-size: ${fontPx - 2}px; text-align: center; margin-top: 3mm; font-weight: bold; }
  .actions { max-width: ${widthMm}mm; margin: 8mm auto 0; text-align: center; }
  .actions button { padding: 8px 16px; font-size: 13px; cursor: pointer; border: 1px solid #333; background: #fff; border-radius: 6px; }
  .actions button:hover { background: #f5f5f5; }
  .actions a { margin-left: 12px; font-size: 13px; color: #444; }
  @media print {
    body { background: #fff; padding: 0; }
    .paper { width: ${widthMm}mm; box-shadow: none; padding: 2mm; margin: 0; }
    .actions { display: none; }
    @page { margin: 0; size: ${widthMm}mm auto; }
  }
</style>
</head>
<body>
  ${seccionesHtml}
  <div class="actions">
    <button type="button" onclick="window.print()">Imprimir</button>
    <a href="?${modeComandas ? "mode=comandas&" : ""}w=${widthMm === 80 ? 58 : 80}">Cambiar a ${widthMm === 80 ? 58 : 80}mm</a>
  </div>
  <script>
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('auto') === '1') {
        setTimeout(function(){ window.print(); }, 250);
      }
    } catch (e) {}
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
