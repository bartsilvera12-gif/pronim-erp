"use client";

import { useEffect, useState } from "react";

/**
 * Modal de texto reutilizable — reemplaza a window.prompt() con un diálogo
 * branded consistente con el resto del sistema.
 *
 * Uso:
 *   const [open, setOpen] = useState<{ initial: string } | null>(null);
 *   ...
 *   <PromptModal open={open != null} title="Nuevo nombre" initialValue={open?.initial ?? ""}
 *     onConfirm={(v) => { hacerAlgo(v); setOpen(null); }}
 *     onCancel={() => setOpen(null)} />
 */
export function PromptModal({
  open, title, description, initialValue = "", placeholder, maxLength = 120,
  confirmLabel = "Aceptar", cancelLabel = "Cancelar", tone = "primary",
  inputType = "text",
  onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  inputType?: "text" | "number";
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (open) setValue(initialValue); }, [open, initialValue]);
  if (!open) return null;
  const confirmCls =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-[#4FAEB2] hover:bg-[#3F8E91]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        <input
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={maxLength} autoFocus
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm(value);
            if (e.key === "Escape") onCancel();
          }}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => onConfirm(value)}
            disabled={!value.trim()}
            className={`rounded-lg ${confirmCls} disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal de confirmación reutilizable — reemplaza a window.confirm().
 */
export function ConfirmModal({
  open, title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  tone = "danger", onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const confirmCls =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-[#4FAEB2] hover:bg-[#3F8E91]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="mt-2 text-sm text-slate-600">{message}</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            className={`rounded-lg ${confirmCls} px-4 py-2 text-sm font-semibold text-white`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
