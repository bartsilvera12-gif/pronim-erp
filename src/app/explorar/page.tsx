"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Receipt, Shirt, Package, Wallet, Banknote, TrendingDown, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import Transacciones from "./transacciones/page";
import Items from "./items/page";
import Ventas from "./ventas/page";
import Evaluaciones from "./evaluaciones/page";
import Inventario from "./inventario/page";
import Creditos from "./creditos/page";
import Gastos from "./gastos/page";
import Caja from "./caja/page";
import Comparativo from "./comparativo/page";

type TabKey = "transacciones" | "items" | "ventas" | "evaluaciones" | "inventario" | "creditos" | "gastos" | "caja" | "comparativo";

const TABS: { key: TabKey; label: string; Icon: LucideIcon; Comp: React.ComponentType }[] = [
  { key: "transacciones", label: "Transacciones", Icon: ArrowLeftRight, Comp: Transacciones },
  { key: "items",         label: "Ítems (prendas)", Icon: Shirt,       Comp: Items },
  { key: "ventas",        label: "Ventas",        Icon: Receipt,        Comp: Ventas },
  { key: "evaluaciones",  label: "Compras/Eval.", Icon: Shirt,          Comp: Evaluaciones },
  { key: "inventario",    label: "Inventario",    Icon: Package,        Comp: Inventario },
  { key: "creditos",      label: "Créditos",      Icon: Wallet,         Comp: Creditos },
  { key: "gastos",        label: "Gastos",        Icon: TrendingDown,   Comp: Gastos },
  { key: "caja",          label: "Caja",          Icon: Banknote,       Comp: Caja },
  { key: "comparativo",   label: "Comparar períodos", Icon: TrendingUp, Comp: Comparativo },
];

export default function ExplorarHubPage() {
  const [tab, setTab] = useState<TabKey>("transacciones");
  const Activo = TABS.find((t) => t.key === tab)!.Comp;

  return (
    <div className="max-w-full space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Explorar información del ERP</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Toda la data en un solo lugar. Cambiá de vista con las pestañas; en cada una elegí columnas, filtrá, agrupá y exportá a Excel.
          </p>
        </div>
        <Link href="/clientes/segmentos"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Users className="h-4 w-4" /> Clientes ↗
        </Link>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {TABS.map((t) => {
          const activo = t.key === tab;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activo ? "bg-[#4FAEB2] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}>
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Vista activa (se monta/desmonta al cambiar de pestaña) */}
      <div key={tab}>
        <Activo />
      </div>
    </div>
  );
}
