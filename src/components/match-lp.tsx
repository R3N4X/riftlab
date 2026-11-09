"use client";

/**
 * LP ganados o perdidos en una clasificatoria, junto a "Victoria" o "Derrota". Los guarda la app de
 * escritorio leyendo el cliente de League antes y después de cada partida, así que solo aparecen en
 * partidas jugadas con la app abierta y en el perfil de quien la jugó.
 */
import { useSyncExternalStore } from "react";
import { TIER_LABEL, type Tier } from "@/lib/constants";
import type { LpChange } from "@/lib/live";

let changes: Record<string, LpChange> = {};
const listeners = new Set<() => void>();
let hooked = false;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const bridge = window.riftlab;
  if (bridge?.getLpChanges && !hooked) {
    hooked = true;
    const publish = () => listeners.forEach((l) => l());
    void bridge.getLpChanges().then((all) => {
      changes = { ...all, ...changes };
      publish();
    });
    bridge.onLpChange((c) => {
      changes = { ...changes, [c.matchId]: c };
      publish();
    });
  }
  return () => {
    listeners.delete(onChange);
  };
}

const EMPTY: Record<string, LpChange> = {};

export function useLpChanges() {
  return useSyncExternalStore(
    subscribe,
    () => changes,
    () => EMPTY,
  );
}

/** El cambio de LP de una partida, solo si la jugó esa cuenta. */
function changeOf(all: Record<string, LpChange>, matchId: string, riotId: string): LpChange | null {
  const change = all[matchId];
  return change && change.riotId.toLowerCase() === riotId.toLowerCase() ? change : null;
}

export const signed = (delta: number) => `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}`;

/** LP netos del día en las clasificatorias registradas, con el rango después de la última. */
export function SessionLp({ matchIds, riotId }: { matchIds: string[]; riotId: string }) {
  const all = useLpChanges();
  const found = matchIds.flatMap((id) => {
    const c = changeOf(all, id, riotId);
    return c ? [c] : [];
  });
  if (!found.length) return null;
  const total = found.reduce((s, c) => s + c.delta, 0);
  const last = found.reduce((a, b) => (b.at > a.at ? b : a));
  return (
    <p className="text-sm text-muted">
      <span className={`font-display text-lg font-semibold ${total >= 0 ? "text-win" : "text-loss"}`}>{signed(total)} LP</span>
      <span className="text-dim">
        {" "}
        hoy, ahora {TIER_LABEL[last.tier as Tier] ?? last.tier}
        {last.division && ` ${last.division}`} {last.lp} LP
      </span>
    </p>
  );
}

/** LP de una partida debajo de su ícono en la sesión del día. */
export function GameLp({ matchId, riotId }: { matchId: string; riotId: string }) {
  const change = changeOf(useLpChanges(), matchId, riotId);
  if (!change) return null;
  return <span className={`text-[11px] leading-none font-semibold ${change.delta >= 0 ? "text-win" : "text-loss"}`}>{signed(change.delta)}</span>;
}

export function MatchLp({ matchId, riotId }: { matchId: string; riotId: string }) {
  const change = changeOf(useLpChanges(), matchId, riotId);
  if (!change) return null;
  const sign = change.delta > 0 ? "+" : change.delta < 0 ? "−" : "±";
  return (
    <span className={`ml-1.5 font-display text-sm font-semibold ${change.delta >= 0 ? "text-win" : "text-loss"}`}>
      {sign}
      {Math.abs(change.delta)} LP
    </span>
  );
}
