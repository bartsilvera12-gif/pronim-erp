"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";

const STANDALONE_ROUTES = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isStandalone = pathname && STANDALONE_ROUTES.includes(pathname);
  // Modo embebido (iframe dentro de un modal): sin sidebar ni header,
  // solo el contenido con scroll propio. Se usa en el modal de detalle de
  // cliente desde la caja.
  const isEmbed = searchParams?.get("embed") === "1";

  if (isStandalone) {
    return <>{children}</>;
  }

  if (isEmbed) {
    return (
      <main className="h-svh overflow-y-auto overflow-x-hidden bg-[#F8FAFC] p-4 sm:p-6">
        {children}
      </main>
    );
  }

  return (
    <div id="neura-app-shell" className="flex h-svh min-h-0 overflow-hidden bg-[#F8FAFC]">
      <Sidebar />
      <div id="neura-main-column" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        {/* pb-20 en mobile reserva ~80px para que el contenido scrolleable no quede
            tapado por MobileBottomNav (fixed bottom). md:pb-6 vuelve al padding normal
            en desktop donde no hay barra inferior. */}
        <main
          id="neura-main-content"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
