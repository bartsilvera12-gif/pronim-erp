"use client";

import UsuarioNuevoForm from "@/app/usuarios/components/UsuarioNuevoForm";

/**
 * Ruta /usuarios/nuevo — delega al componente reusable UsuarioNuevoForm
 * (mismo que usa el modal). Así la lógica de sucursal, cupo y validaciones
 * se mantiene en un solo lugar; antes esta ruta tenía una copia vieja que
 * no fetcheaba sucursales ni enviaba sucursal_id en el body.
 */
export default function NuevoUsuarioPage() {
  return <UsuarioNuevoForm variant="page" />;
}
