/**
 * Nombre legible de una ruta, para el botón Volver.
 *
 * "Volver" solo no dice nada; "Volver al dashboard" sí. El mapa va de más
 * específico a más general y se resuelve por prefijo, así que una ficha como
 * /clientes/abc123/consultas cae en "Clientes" sin necesidad de listarla.
 */

const RUTAS: { prefijo: string; nombre: string }[] = [
  // Más específicas primero: gana la primera que coincida.
  { prefijo: "/explorar/caja-movimientos", nombre: "Movimientos de caja" },
  { prefijo: "/explorar", nombre: "Explorar" },
  { prefijo: "/reportes/caja-movimientos", nombre: "Movimientos de caja" },
  { prefijo: "/reportes/cierres-caja", nombre: "Cierres de caja" },
  { prefijo: "/reportes", nombre: "Reportes" },
  { prefijo: "/clientes/segmentos", nombre: "Clientes" },
  { prefijo: "/clientes", nombre: "Clientes" },
  { prefijo: "/inventario/transferencias", nombre: "Transferencias" },
  { prefijo: "/inventario/movimientos", nombre: "Movimientos de inventario" },
  { prefijo: "/inventario", nombre: "Inventario" },
  { prefijo: "/ventas", nombre: "Órdenes de venta" },
  { prefijo: "/venta/nueva", nombre: "Venta" },
  { prefijo: "/evaluacion", nombre: "Evaluación" },
  { prefijo: "/atencion", nombre: "Atención" },
  { prefijo: "/compras", nombre: "Compras" },
  { prefijo: "/proveedores", nombre: "Proveedores" },
  { prefijo: "/gastos", nombre: "Gastos" },
  { prefijo: "/otros-ingresos", nombre: "Otros ingresos" },
  { prefijo: "/pagos", nombre: "Pagos" },
  { prefijo: "/cobranzas", nombre: "Cobranzas" },
  { prefijo: "/comisiones", nombre: "Comisiones" },
  { prefijo: "/buscador", nombre: "Consulta" },
  { prefijo: "/usuarios", nombre: "Usuarios" },
  { prefijo: "/admin/sucursales", nombre: "Sucursales" },
  { prefijo: "/admin/metas", nombre: "Metas" },
  { prefijo: "/admin/promociones", nombre: "Promociones" },
  { prefijo: "/admin/franjas", nombre: "Categorías de precio" },
  { prefijo: "/admin/reportes", nombre: "Reportes" },
  { prefijo: "/admin/web", nombre: "Sitio web" },
  { prefijo: "/configuracion/entidades-bancarias", nombre: "Entidades bancarias" },
  { prefijo: "/configuracion/facturacion", nombre: "Facturación" },
  { prefijo: "/configuracion", nombre: "Configuración" },
  { prefijo: "/dashboard", nombre: "Dashboard" },
  { prefijo: "/", nombre: "Inicio" },
];

export function nombreDeRuta(path: string | null | undefined): string | null {
  if (!path) return null;
  const limpio = path.split("?")[0].split("#")[0];
  for (const r of RUTAS) {
    if (r.prefijo === "/") {
      if (limpio === "/") return r.nombre;
      continue;
    }
    if (limpio === r.prefijo || limpio.startsWith(r.prefijo + "/")) return r.nombre;
  }
  return null;
}
