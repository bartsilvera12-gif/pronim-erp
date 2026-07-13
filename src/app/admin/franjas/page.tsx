import { redirect } from "next/navigation";

/**
 * Alias legacy — /admin/franjas se movió a /admin/categorias.
 * Mantengo el redirect por compatibilidad con bookmarks/links viejos.
 */
export default function AdminFranjasRedirect() {
  redirect("/admin/categorias");
}
