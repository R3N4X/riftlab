"use client";

import { useId, useState } from "react";

/**
 * Tarjeta con un resumen siempre visible y un detalle que se despliega.
 * El detalle llega ya renderizado desde el servidor: abrirlo no hace
 * consultas nuevas.
 */
export function Expandable({
  summary,
  details,
  className = "",
  label,
}: {
  summary: React.ReactNode;
  details: React.ReactNode;
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className={className}>
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">{summary}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? `Ocultar detalle de ${label}` : `Ver detalle de ${label}`}
          className="flex w-10 shrink-0 items-center justify-center border-l border-line/60 text-muted transition-colors hover:bg-raised/60 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div id={id} hidden={!open}>
        {open && details}
      </div>
    </li>
  );
}
