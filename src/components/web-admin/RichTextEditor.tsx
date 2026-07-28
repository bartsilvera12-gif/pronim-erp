"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote,
  Link as LinkIcon, Image as ImageIcon, Undo2, Redo2, Eraser,
} from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Editor rich-text minimal para el cuerpo de los posts del blog.
 * Usa `contentEditable` + `document.execCommand`: sin dependencias externas,
 * emite HTML plano que el cliente akakuaa (post.html) inyecta en un
 * contenedor `.post-body` con estilos ya definidos.
 *
 * No pretende ser Tiptap — cubre lo que Karen necesita:
 * H2/H3, párrafos, negrita/itálica, listas, cita, link e imagen.
 */

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Sincroniza el HTML entrante solo cuando difiere del contenido actual del DOM,
  // para no matar la posicion del caret en cada tecleo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
  }, [onChange]);

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* ignoramos: algunos browsers dan warning por deprecacion */
    }
    emit();
  }

  function block(tag: "H2" | "H3" | "P" | "BLOCKQUOTE") {
    exec("formatBlock", tag);
  }

  function insertLink() {
    const url = window.prompt("URL del enlace:", "https://");
    if (!url) return;
    exec("createLink", url);
    // Aseguramos target=_blank via post-proceso
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll("a").forEach((a) => {
      if (!a.getAttribute("target")) a.setAttribute("target", "_blank");
      if (!a.getAttribute("rel")) a.setAttribute("rel", "noopener noreferrer");
    });
    emit();
  }

  async function insertImage() {
    const el = ref.current;
    if (!el) return;
    const url = window.prompt("URL de la imagen (o dejá vacío para subir una desde tu compu):");
    if (url === null) return;
    if (url.trim()) {
      exec("insertImage", url.trim());
      return;
    }
    // Sin URL → abrir file picker y subir al bucket web-imagenes/blog
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("modulo", "blog");
        const r = await fetchWithSupabaseSession("/api/admin/web/upload", {
          method: "POST",
          body: fd,
        });
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j?.error ?? "Error al subir");
        exec("insertImage", String(j.data?.url ?? ""));
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "No se pudo subir la imagen");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  function clearFormat() {
    exec("removeFormat");
    // Convertir bloque actual a párrafo por si quedó dentro de H2/H3/blockquote
    exec("formatBlock", "P");
  }

  const btnBase =
    "inline-flex items-center justify-center rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200";

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1.5">
        <ToolbarBtn title="Negrita (Ctrl+B)" onClick={() => exec("bold")} className={btnBase}>
          <Bold className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Itálica (Ctrl+I)" onClick={() => exec("italic")} className={btnBase}>
          <Italic className="h-4 w-4" />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn title="Título grande (H2)" onClick={() => block("H2")} className={btnBase}>
          <Heading2 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Subtítulo (H3)" onClick={() => block("H3")} className={btnBase}>
          <Heading3 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Párrafo" onClick={() => block("P")} className={btnBase}>
          <span className="text-xs font-semibold px-1">P</span>
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn title="Lista con puntos" onClick={() => exec("insertUnorderedList")} className={btnBase}>
          <List className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Lista numerada" onClick={() => exec("insertOrderedList")} className={btnBase}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Cita" onClick={() => block("BLOCKQUOTE")} className={btnBase}>
          <Quote className="h-4 w-4" />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn title="Insertar enlace" onClick={insertLink} className={btnBase}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Insertar imagen"
          onClick={insertImage}
          className={btnBase}
          disabled={uploading}
        >
          <ImageIcon className="h-4 w-4" />
          {uploading && <span className="ml-1 text-[10px]">Subiendo…</span>}
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn title="Deshacer (Ctrl+Z)" onClick={() => exec("undo")} className={btnBase}>
          <Undo2 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Rehacer (Ctrl+Shift+Z)" onClick={() => exec("redo")} className={btnBase}>
          <Redo2 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Limpiar formato" onClick={clearFormat} className={btnBase}>
          <Eraser className="h-4 w-4" />
        </ToolbarBtn>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Pegar como texto plano (evita traer estilos raros de Word/Docs)
          const text = e.clipboardData.getData("text/plain");
          if (!text) return;
          e.preventDefault();
          document.execCommand("insertText", false, text);
          emit();
        }}
        data-placeholder={placeholder ?? "Empezá a escribir…"}
        className="min-h-[240px] max-h-[520px] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-800 focus:outline-none [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_a]:text-[#4FAEB2] [&_a]:underline [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-slate-400"
      />
    </div>
  );
}

function ToolbarBtn({
  title, onClick, children, className, disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  className: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // no perder foco / selección
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />;
}
