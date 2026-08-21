"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getEntidadesBancarias,
  createEntidadBancaria,
  updateEntidadBancaria,
  deleteEntidadBancaria,
  type EntidadBancaria,
  type TipoEntidad,
} from "@/lib/entidades/storage";
import { alert, confirm } from "@/components/ui/dialog";

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4FAEB2] outline-none";

const TIPOS: { value: TipoEntidad; label: string }[] = [
  { value: "caja", label: "Caja" },
  { value: "banco", label: "Banco" },
  { value: "tarjeta", label: "Tarjeta / POS" },
  { value: "billetera", label: "Billetera" },
  { value: "otro", label: "Otro" },
];
const tipoLabel = (t: string | null) => TIPOS.find((x) => x.value === t)?.label ?? "Otro";

export default function EntidadesBancariasPage() {
  const [lista, setLista] = useState<EntidadBancaria[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form crear
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoEntidad>("banco");

  // Edición inline
  const [editId, setEditId] = useState<string | null>(null);
  const [eCodigo, setECodigo] = useState("");
  const [eNombre, setENombre] = useState("");
  const [eTipo, setETipo] = useState<TipoEntidad>("banco");

  async function reload() {
    setLista(await getEntidadesBancarias({ todas: true }));
  }
  useEffect(() => { reload(); }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return;
    const res = await createEntidadBancaria({
      codigo: codigo.trim() || null,
      nombre: nombre.trim(),
      tipo,
      activo: true,
      orden: lista.length,
    });
    if (!res.ok) { setError(res.error); return; }
    setCodigo(""); setNombre(""); setTipo("banco");
    await reload();
  }

  function startEdit(en: EntidadBancaria) {
    setEditId(en.id);
    setECodigo(en.codigo ?? "");
    setENombre(en.nombre);
    setETipo((en.tipo as TipoEntidad) ?? "otro");
    setError(null);
  }
  async function saveEdit() {
    if (!editId) return;
    const res = await updateEntidadBancaria(editId, {
      codigo: eCodigo.trim() || null,
      nombre: eNombre.trim(),
      tipo: eTipo,
    });
    if (!res.ok) { setError(res.error); return; }
    setEditId(null);
    await reload();
  }
  async function toggleActivo(en: EntidadBancaria) {
    const res = await updateEntidadBancaria(en.id, { activo: !en.activo });
    if (!res.ok) setError(res.error); else await reload();
  }
  async function handleBorrar(en: EntidadBancaria) {
    setError(null);
    const ok = await confirm({
      title: "Borrar entidad",
      message: `¿Borrar "${en.nombre}"? Si tiene cobros asociados se desactivará en lugar de eliminarse.`,
      confirmText: "Borrar",
      variant: "danger",
    });
    if (!ok) return;
    const res = await deleteEntidadBancaria(en.id);
    if (!res.ok) { setError(res.error); return; }
    if (res.data.mode === "soft") {
      void alert({
        message: `"${en.nombre}" tiene cobros asociados, así que se desactivó (no se puede borrar del todo para conservar el historial).`,
        variant: "warning",
      });
    }
    await reload();
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 pb-10 sm:px-6 lg:px-8">
      <div>
        <Link href="/configuracion" className="text-sm text-sky-600 hover:underline">← Configuración</Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Entidades bancarias</h1>
        <p className="text-sm text-slate-600">
          Cajas, bancos, tarjetas/POS y billeteras usados al cobrar una venta. El código corto agiliza la búsqueda del cajero.
        </p>
      </div>

      <form onSubmit={handleCrear} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 max-w-xl">
        <h2 className="text-sm font-semibold text-slate-800">Nueva entidad</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Código</label>
            <input className={`${inputClass} uppercase`} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej: BASA" maxLength={20} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Nombre *</label>
            <input className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Banco Basa" required />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
          <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntidad)}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-medium text-white hover:bg-[#3F8E91]">
          Crear entidad
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-600">
              <th className="py-3 pr-4 font-semibold">Código</th>
              <th className="py-3 pr-4 font-semibold">Nombre</th>
              <th className="py-3 pr-4 font-semibold">Tipo</th>
              <th className="py-3 pr-4 font-semibold">Activo</th>
              <th className="py-3 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((en) => (
              <tr key={en.id} className="border-b border-slate-50 last:border-0">
                <td className="py-3 pr-4 font-mono text-xs">
                  {editId === en.id ? (
                    <input className={`${inputClass} uppercase`} value={eCodigo} onChange={(e) => setECodigo(e.target.value)} maxLength={20} />
                  ) : (en.codigo || "—")}
                </td>
                <td className="py-3 pr-4">
                  {editId === en.id ? (
                    <input className={inputClass} value={eNombre} onChange={(e) => setENombre(e.target.value)} />
                  ) : (<span className="font-medium text-slate-800">{en.nombre}</span>)}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {editId === en.id ? (
                    <select className={inputClass} value={eTipo} onChange={(e) => setETipo(e.target.value as TipoEntidad)}>
                      {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  ) : tipoLabel(en.tipo)}
                </td>
                <td className="py-3 pr-4">
                  <button type="button" onClick={() => toggleActivo(en)}
                    title={en.activo ? "Click para desactivar" : "Click para activar"}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors active:scale-95 ${en.activo ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200 ring-1 ring-slate-200"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${en.activo ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {en.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="py-3">
                  {editId === en.id ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void saveEdit()}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] active:scale-95">
                        ✓ Guardar
                      </button>
                      <button type="button" onClick={() => setEditId(null)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 active:scale-95">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => startEdit(en)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#4FAEB2]/40 bg-[#4FAEB2]/10 px-3 py-1.5 text-xs font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/20 active:scale-95">
                        ✏️ Editar
                      </button>
                      <button type="button" onClick={() => void handleBorrar(en)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 active:scale-95">
                        🗑 Borrar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="py-8 text-center text-slate-400">Sin entidades cargadas.</p>}
      </div>
    </div>
  );
}
