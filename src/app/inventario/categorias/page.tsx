import { redirect } from "next/navigation";

/**
 * En el modelo Pronim, las categorías son el eje central y viven en
 * /admin/categorias (con precio + stock por categoría). La pantalla
 * informativa antigua (solo nombre + código + imagen) ya no aplica.
 * Redirigimos para no confundir al usuario.
 */
export default function InventarioCategoriasRedirect() {
  redirect("/admin/categorias");
}
