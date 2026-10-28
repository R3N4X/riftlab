"use client";

/**
 * LP ganados o perdidos en una clasificatoria, junto a "Victoria" o "Derrota". Los guarda la app de
 * escritorio leyendo el cliente de League antes y después de cada partida, así que solo aparecen en
 * partidas jugadas con la app abierta y en el perfil de quien la jugó.
 */
import { useSyncExternalStore } from "react";
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

export function MatchLp({ matchId, riotId }: { matchId: string; riotId: string }) {
  const all = useSyncExternalStore(
    subscribe,
    () => changes,
    () => EMPTY,
  );
  const change = all[matchId];
  if (!change || change.riotId.toLowerCase() !== riotId.toLowerCase()) return null;
  const sign = change.delta > 0 ? "+" : change.delta < 0 ? "−" : "±";
  return (
    <span className={`ml-1.5 font-display text-sm font-semibold ${change.delta >= 0 ? "text-win" : "text-loss"}`}>
      {sign}
      {Math.abs(change.delta)} LP
    </span>
  );
}
