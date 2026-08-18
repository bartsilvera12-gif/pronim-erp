import { redirect } from "next/navigation";

/**
 * La vista de Clientes es ahora el explorador de Segmentos
 * (/clientes/segmentos): mismo listado con columnas elegibles, filtros
 * combinables tipo Excel, orden por columna y export XLSX. La "lista clásica"
 * quedó reemplazada. El alta de clientes vive en /clientes/nuevo y la ficha
 * individual en /clientes/[id].
 */
export default function ClientesPage() {
  redirect("/clientes/segmentos");
}
