"use client";

import { useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Botón "Subir imagen/video" para los admins de web (catálogo y
 * tesoros). Abre el file picker, sube al bucket `web-imagenes` vía
 * /api/admin/web/upload, y devuelve la URL pública al caller vía
 * `onUploaded`.
 *
 * No maneja el estado del input de texto — el caller decide qué hacer
 * con la URL (típicamente setearla en el draft del modal).
 */
export default function WebUploadButton({
  modulo,
  onUploaded,
  accept = "image/*",
  labelIdle,
  labelBusy,
}: {
  modulo: "catalogo" | "tesoros";
  onUploaded: (url: string, tipo: "foto" | "video") => void;
  /** MIME accept del input. "image/*" para catálogo; "image/*,video/mp4,video/webm" para tesoros. */
  accept?: string;
  labelIdle?: string;
  labelBusy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(f: File) {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("modulo", modulo);
      const r = await fetchWithSupabaseSession("/api/admin/web/upload", {
        method: "POST",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        throw new Error(j?.error ?? `Error ${r.status}`);
      }
      const url = String(j.data?.url ?? "");
      const tipo = (j.data?.tipo ?? "foto") as "foto" | "video";
      if (!url) throw new Error("El servidor no devolvió una URL.");
      onUploaded(url, tipo);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir el archivo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <label
        className={`inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-[#4FAEB2]/40 bg-white px-3 py-2 text-xs font-semibold text-[#4FAEB2] cursor-pointer hover:bg-[#4FAEB2]/5 transition ${
          busy ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16" />
        </svg>
        {busy ? (labelBusy ?? "Subiendo…") : (labelIdle ?? "Subir")}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>
      {err && <p className="text-[10px] text-rose-600 max-w-[180px] text-right">{err}</p>}
    </div>
  );
}
