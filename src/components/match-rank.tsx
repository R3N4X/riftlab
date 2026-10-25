"use client";

import { useEffect, useRef, useState } from "react";
import { TIER_LABEL } from "@/lib/constants";
import type { MatchRanks, PlayerRank as Rank } from "@/lib/match-rank";
import { RankCrest } from "./icons";

/*
 * Los rangos de una partida cuestan hasta 10 consultas a Riot: se piden recién
 * cuando la tarjeta entra en pantalla, y una sola vez por partida aunque los
 * usen el promedio de la tarjeta y las 10 filas del detalle.
 */
const requests = new Map<string, Promise<MatchRanks | null>>();

function loadRanks(platform: string, matchId: string): Promise<MatchRanks | null> {
  const key = `${platform}/${matchId}`;
  let request = requests.get(key);
  if (!request) {
    request = fetch(`/api/partidas/${platform}/${matchId}/rango`)
      .then((res) => (res.ok ? (res.json() as Promise<MatchRanks>) : null))
      .catch(() => null)
      // Un fallo (por ejemplo, el límite de consultas) no se recuerda: la próxima vez se reintenta.
      .then((r) => (r ?? (requests.delete(key), null)));
    requests.set(key, request);
  }
  return request;
}

/** undefined mientras carga; null si no se pudo. */
function useMatchRanks(platform: string, matchId: string, enabled: boolean) {
  const [ranks, setRanks] = useState<MatchRanks | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadRanks(platform, matchId).then((r) => !cancelled && setRanks(r));
    return () => {
      cancelled = true;
    };
  }, [enabled, platform, matchId]);
  return ranks;
}

/** "Platino 4"; de Maestro hacia arriba no hay división. */
function rankLabel(r: Rank): string {
  const division = { I: "1", II: "2", III: "3", IV: "4" }[r.rank];
  return division ? `${TIER_LABEL[r.tier]} ${division}` : TIER_LABEL[r.tier];
}

/** Rango promedio de la partida, en la tarjeta del historial. */
export function MatchRank({ platform, matchId }: { platform: string; matchId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const ranks = useMatchRanks(platform, matchId, visible);
  const average = ranks?.average;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="mt-3 min-h-10">
      {ranks === undefined ? (
        <div className="h-10 w-24 animate-pulse rounded bg-raised/60" aria-label="Cargando el rango promedio" />
      ) : average ? (
        <div className="flex items-center gap-2" title={`Promedio de ${average.ranked} de ${average.players} jugadores con rango`}>
          <RankCrest tier={average.tier} size={32} />
          <div className="leading-tight">
            <p className="text-sm font-semibold whitespace-nowrap">
              {TIER_LABEL[average.tier]} {average.rank}
            </p>
            <p className="text-xs text-muted">{average.leaguePoints} LP</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Rango de un jugador en la tabla del detalle; si no se pudo cargar, queda el campeón. */
export function PlayerRank({ platform, matchId, puuid, fallback }: { platform: string; matchId: string; puuid: string; fallback?: string }) {
  const ranks = useMatchRanks(platform, matchId, true);
  if (ranks === undefined) return <span className="mt-0.5 block h-3.5 w-16 animate-pulse rounded bg-raised/60" />;
  if (!ranks) return <span className="block truncate text-xs text-dim">{fallback}</span>;

  const rank = ranks.players[puuid];
  if (!rank) return <span className="block truncate text-xs text-dim">Sin clasificar</span>;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted" title={`${rankLabel(rank)}, ${rank.leaguePoints} LP`}>
      <RankCrest tier={rank.tier} size={14} />
      <span className="truncate">{rankLabel(rank)}</span>
    </span>
  );
}
