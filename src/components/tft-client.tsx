"use client";

/*
 * Piezas de cliente de TFT: fijar comps (se guardan en este equipo) y la
 * ventana flotante de la app de escritorio.
 */
import { useState, useSyncExternalStore } from "react";
import { togglePinnedComp, usePinnedComps } from "@/lib/preferences";

export function PinButton({ compKey, name }: { compKey: string; name: string }) {
  const pinned = usePinnedComps().includes(compKey);
  return (
    <button
      type="button"
      onClick={() => togglePinnedComp(compKey)}
      aria-pressed={pinned}
      title={pinned ? "Quitar de Modo partida" : "Tenerla a mano en Modo partida"}
      aria-label={pinned ? `Quitar ${name} de Modo partida` : `Fijar ${name} para Modo partida`}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
        pinned ? "border-gold bg-gold/20 text-gold-soft" : "border-line text-muted hover:border-gold/60 hover:text-ink"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill={pinned ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
      </svg>
      {pinned ? "Fijada" : "Fijar"}
    </button>
  );
}

const noop = () => () => {};

/** En la app de escritorio: muestra u oculta la ventana flotante que queda encima del juego. */
export function OverlayButton() {
  const isDesktop = useSyncExternalStore(
    noop,
    () => Boolean(window.riftlab),
    () => false,
  );
  const [visible, setVisible] = useState<boolean | null>(null);
  if (!isDesktop) return null;
  return (
    <button
      type="button"
      onClick={async () => setVisible(await window.riftlab!.toggleTftOverlay())}
      className="rounded-md border border-gold/60 bg-gold/15 px-3 py-1.5 text-sm font-medium text-gold-soft transition-colors hover:bg-gold hover:text-night"
      title="También con Ctrl + Shift + T, incluso dentro del juego"
    >
      {visible ? "Ocultar ventana flotante" : "Abrir ventana flotante"}
    </button>
  );
}

/**
 * En la app de escritorio: guarda la comp en el Planificador de TFT del cliente
 * y la deja como recordatorio, así el juego marca esas unidades en la tienda.
 */
export function ExportPlanButton({ set, name, champions }: { set: number; name: string; champions: string[] }) {
  const isDesktop = useSyncExternalStore(
    noop,
    () => Boolean(window.riftlab),
    () => false,
  );
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; message?: string }>({ busy: false });
  if (!isDesktop) return null;
  const label = state.busy ? "Exportando…" : state.ok === undefined ? "Planificador" : state.ok ? "En el planificador" : "No se pudo";
  return (
    <button
      type="button"
      disabled={state.busy}
      onClick={async () => {
        setState({ busy: true });
        try {
          const result = await window.riftlab!.exportTftPlan({ set, title: name, champions });
          setState({ busy: false, ...result });
        } catch {
          setState({ busy: false, ok: false, message: "No se pudo comunicar con el cliente de League." });
        }
      }}
      title={state.message ?? "Guardar en el Planificador de TFT del cliente: en la partida, la tienda marca estas unidades"}
      aria-label={`Exportar ${name} al Planificador de TFT`}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-60 ${
        state.ok === false
          ? "border-loss/60 text-loss"
          : state.ok
            ? "border-win/60 text-win"
            : "border-line text-muted hover:border-gold/60 hover:text-ink"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
      </svg>
      {label}
    </button>
  );
}
