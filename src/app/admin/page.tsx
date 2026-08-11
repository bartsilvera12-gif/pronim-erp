import Link from "next/link";

/**
 * Hub de administración — índice visual de todas las secciones admin.
 * Aterrizás acá con /admin y elegís qué configurar. Cada tarjeta linkea
 * a su página específica.
 */

type SeccionAdmin = {
  href: string;
  emoji: string;
  titulo: string;
  descripcion: string;
  tono: "sky" | "emerald" | "fuchsia" | "amber" | "slate" | "rose";
};

const SECCIONES: SeccionAdmin[] = [
  { href: "/admin/sucursales",         emoji: "🏬", titulo: "Sucursales",             descripcion: "Nombres, moneda, sucursal principal.",                                 tono: "sky" },
  { href: "/admin/metas",              emoji: "🎯", titulo: "Metas y comisiones",     descripcion: "Meta diaria/mensual, % de comisión, bonos por ticket alto.",           tono: "emerald" },
  { href: "/admin/franjas",            emoji: "🏷️", titulo: "Franjas de precio",       descripcion: "Categorías de precio (Gs. 50.000, 100.000, etc).",                    tono: "amber" },
  { href: "/admin/categorias",         emoji: "📂", titulo: "Categorías",             descripcion: "Categorías generales del catálogo.",                                   tono: "slate" },
  { href: "/admin/promociones",        emoji: "🎁", titulo: "Promociones y campañas", descripcion: "Descuentos automáticos, cupones, cashback.",                            tono: "fuchsia" },
  { href: "/admin/motivos-descuento",  emoji: "💰", titulo: "Motivos de descuento",   descripcion: "Lista editable que aparece al cerrar una venta con descuento.",         tono: "amber" },
  { href: "/admin/categorias-clientes", emoji: "🧑‍🤝‍🧑", titulo: "Categorías de clientes", descripcion: "Umbrales VIP / dormido / sin volver / nuevo — configurables.",       tono: "fuchsia" },
  { href: "/configuracion/tipos-prenda", emoji: "👕", titulo: "Tipos de producto",       descripcion: "Catálogo de tipos (remera, jean, calzado…) usado en evaluaciones.",     tono: "slate" },
  { href: "/admin/formas-pago",        emoji: "💳", titulo: "Formas de pago",         descripcion: "Renombrar, reordenar o desactivar métodos (efectivo / tarjeta / QR…).",  tono: "emerald" },
  { href: "/configuracion/entidades-bancarias", emoji: "🏦", titulo: "Entidades bancarias", descripcion: "Bancos / tarjetas / billeteras que se pueden asociar a un pago.",   tono: "sky" },
  { href: "/admin/conciliacion",       emoji: "🏦", titulo: "Conciliación bancaria",  descripcion: "Estado de cada pago (pendiente / confirmada / conciliada).",           tono: "sky" },
  { href: "/admin/auditoria",          emoji: "📋", titulo: "Auditoría",              descripcion: "Log de cambios sensibles con antes/después/motivo.",                    tono: "slate" },
  { href: "/admin/reportes/ventas",    emoji: "📈", titulo: "Reporte de ventas",     descripcion: "Facturado / tickets / método. Click en KPI o sucursal para drill.",     tono: "emerald" },
  { href: "/admin/reportes/descuentos", emoji: "📊", titulo: "Reporte de descuentos", descripcion: "Cuánto se descontó por motivo, sucursal y período. Drill a ventas.",   tono: "rose" },
  { href: "/admin/reportes/creditos",   emoji: "💰", titulo: "Créditos y cashback",    descripcion: "Saldos por cliente, entradas/salidas, drill por origen y tipo.",       tono: "emerald" },
  { href: "/admin/reportes/compras",   emoji: "🛒", titulo: "Compras y evaluaciones", descripcion: "Valor pagado, prendas, markup, pendientes de ingreso al stock.",       tono: "sky" },
  { href: "/admin/reportes/evaluaciones", emoji: "🧾", titulo: "Evaluaciones (drill)", descripcion: "Drill por sucursal / evaluadora / estado / tipo de prenda + CSV.",       tono: "sky" },
  { href: "/admin/reportes/inventario", emoji: "📦", titulo: "Inventario (drill)",    descripcion: "Stock, valor, bajo stock y sin stock. Drill por categoría/tipo/sucursal.", tono: "amber" },
  { href: "/admin/reportes/metas",      emoji: "🎯", titulo: "Metas y comisiones",     descripcion: "Días con meta alcanzada, ventas vs meta y comisión por vendedora.",     tono: "amber" },
  { href: "/admin/empresas",           emoji: "🏢", titulo: "Empresas",               descripcion: "Datos generales de la empresa (super admin).",                          tono: "slate" },
  { href: "/usuarios",                 emoji: "👥", titulo: "Usuarios y permisos",    descripcion: "Alta, cargo, sucursal, permisos por módulo.",                           tono: "rose" },
];

const TONO_BG: Record<SeccionAdmin["tono"], string> = {
  sky:     "border-sky-200 bg-sky-50/60",
  emerald: "border-emerald-200 bg-emerald-50/60",
  fuchsia: "border-fuchsia-200 bg-fuchsia-50/60",
  amber:   "border-amber-200 bg-amber-50/60",
  slate:   "border-slate-200 bg-slate-50/60",
  rose:    "border-rose-200 bg-rose-50/60",
};

export default function AdminHubPage() {
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Administración</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Parámetros comerciales y operativos que cambian con frecuencia. Cada área es autoservicio — no necesitás pasar por programación.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`block rounded-2xl border ${TONO_BG[s.tono]} p-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 hover:border-[#4FAEB2]`}
          >
            <div className="text-2xl leading-none mb-2">{s.emoji}</div>
            <p className="text-sm font-bold text-slate-900">{s.titulo}</p>
            <p className="text-xs text-slate-600 mt-1">{s.descripcion}</p>
          </Link>
        ))}
      </div>

      <p className="text-[11px] text-slate-400 pt-4 border-t border-slate-100">
        Otras áreas todavía no configurables desde acá (roadmap): tipos de producto, formas de pago, categorías de clientes (VIP/dormido), tipos de beneficios. Se agregan progresivamente.
      </p>
    </div>
  );
}
