"use client";

import Link from "next/link";

const SECCIONES = [
  { href: "/explorar/transacciones", titulo: "Transacciones (todo)",   desc: "Ventas, compras y cambios en un solo listado con signo: valor, stock, pagos por método, markup, descuento, cashback." },
  { href: "/explorar/ventas",        titulo: "Ventas",                 desc: "Cada venta: fecha, tienda, cliente, valor, forma de pago, descuento, cantidad." },
  { href: "/clientes/segmentos",     titulo: "Clientes",               desc: "Cartera completa: última compra, total comprado, crédito, cashback, VIP." },
  { href: "/explorar/evaluaciones",  titulo: "Compras / Evaluaciones",  desc: "Prendas evaluadas por cliente: sucursal, evaluadora, total pagado, estado." },
  { href: "/explorar/inventario",    titulo: "Inventario",              desc: "Productos: stock, valor, costo, precio, categoría, tipo, bajo/sin stock." },
  { href: "/explorar/creditos",      titulo: "Créditos y Cashback",     desc: "Movimientos de cartera: cliente, tipo, categoría, origen, monto." },
  { href: "/explorar/caja",          titulo: "Cierres de caja",         desc: "Turnos: apertura/cierre, contado vs esperado, diferencias, por usuario." },
];

export default function ExplorarHubPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Explorar información del ERP</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Toda la data en un solo lugar. En cada sección: elegí columnas, filtrá cada campo, combiná filtros,
          ordená por cualquier columna y exportá a Excel. Como una planilla, pero conectada a tu operación en vivo.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SECCIONES.map((s) => (
          <Link key={s.href} href={s.href}
            className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#4FAEB2]/50 hover:shadow transition">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-bold text-slate-800 group-hover:text-[#3F8E91]">{s.titulo}</h2>
            </div>
            <p className="text-xs text-slate-500">{s.desc}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-4 py-3 text-xs text-sky-800">
        <p className="font-semibold mb-1">Cómo funciona en cada sección</p>
        <p>1) Botón <strong>Columnas</strong> → elegís qué ver. 2) Botón <strong>Filtros</strong> → condición por campo
          (mayor/menor, entre, rango de fecha, contiene, selección). 3) Los filtros se <strong>acumulan</strong>.
          4) Click en el encabezado ordena. 5) <strong>Exportar Excel</strong> baja exactamente lo que ves.</p>
      </div>
    </div>
  );
}
