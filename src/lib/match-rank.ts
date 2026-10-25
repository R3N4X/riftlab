/**
 * Rango de los jugadores de una partida y su promedio. Riot no lo entrega: hay
 * que pedir la liga de cada uno de los 10 (una consulta por jugador), así que
 * cada liga se cachea unas horas y la tarjeta lo pide recién cuando se ve.
 */
import { cacheLife } from "next/cache";
import { TIERS, type Platform, type Tier } from "./constants";
import { RiotApiError, getLeagueEntries, getMatch, isRiotBusy, type LeagueEntry } from "./riot";

export interface PlayerRank {
  tier: Tier;
  /** División (I a IV); vacía de Maestro hacia arriba, que no tienen. */
  rank: string;
  leaguePoints: number;
}

export interface AverageRank extends PlayerRank {
  /** Cuántos de los jugadores tenían rango en la cola usada. */
  ranked: number;
  players: number;
}

export interface MatchRanks {
  average: AverageRank | null;
  /** Rango de cada jugador por puuid; null si no tiene en la cola usada. */
  players: Record<string, PlayerRank | null>;
}

const APEX: readonly Tier[] = ["MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISIONS = ["IV", "III", "II", "I"];
const FLEX_QUEUE = 440;
// Hierro IV a Diamante I son 7 divisiones de 400 LP; de ahí en adelante solo
// cuentan los LP, porque Gran Maestro y Retador son cortes sobre los LP de Maestro.
const APEX_FLOOR = TIERS.indexOf("MASTER") * 400;

async function cachedLeagueEntries(platform: Platform, puuid: string): Promise<LeagueEntry[]> {
  "use cache";
  cacheLife("hours");
  // El rango es secundario: si el perfil se está quedando sin consultas, se salta (el error no queda en caché).
  if (isRiotBusy(platform)) throw new RiotApiError(429, "Sin consultas libres para el rango");
  return getLeagueEntries(platform, puuid);
}

function toPlayerRank(entry: LeagueEntry): PlayerRank | null {
  if (!TIERS.includes(entry.tier as Tier)) return null;
  const apex = APEX.includes(entry.tier as Tier);
  if (!apex && !DIVISIONS.includes(entry.rank)) return null;
  return { tier: entry.tier as Tier, rank: apex ? "" : entry.rank, leaguePoints: entry.leaguePoints };
}

function toPoints(r: PlayerRank): number {
  if (APEX.includes(r.tier)) return APEX_FLOOR + r.leaguePoints;
  return TIERS.indexOf(r.tier) * 400 + DIVISIONS.indexOf(r.rank) * 100 + Math.min(r.leaguePoints, 99);
}

function fromPoints(points: number): PlayerRank {
  const p = Math.round(points);
  if (p >= APEX_FLOOR) {
    const lp = p - APEX_FLOOR;
    // Cortes aproximados: Riot los mueve según la cantidad de jugadores de cada región.
    const tier: Tier = lp >= 1000 ? "CHALLENGER" : lp >= 500 ? "GRANDMASTER" : "MASTER";
    return { tier, rank: "", leaguePoints: lp };
  }
  return {
    tier: TIERS[Math.floor(p / 400)],
    rank: DIVISIONS[Math.floor((p % 400) / 100)],
    leaguePoints: p % 100,
  };
}

export async function getMatchRanks(platform: Platform, matchId: string): Promise<MatchRanks> {
  const match = await getMatch(platform, matchId);
  const preferred = match.info.queueId === FLEX_QUEUE ? "RANKED_FLEX_SR" : "RANKED_SOLO_5x5";
  const fallback = preferred === "RANKED_FLEX_SR" ? "RANKED_SOLO_5x5" : "RANKED_FLEX_SR";

  const players: Record<string, PlayerRank | null> = {};
  await Promise.all(
    match.info.participants.map(async (p) => {
      if (!p.puuid) return;
      const entries = await cachedLeagueEntries(platform, p.puuid).catch(() => null);
      const entry = entries?.find((e) => e.queueType === preferred) ?? entries?.find((e) => e.queueType === fallback);
      players[p.puuid] = entry ? toPlayerRank(entry) : null;
    }),
  );

  const points = Object.values(players)
    .filter((r): r is PlayerRank => r !== null)
    .map(toPoints);
  const average =
    points.length === 0
      ? null
      : {
          ...fromPoints(points.reduce((s, p) => s + p, 0) / points.length),
          ranked: points.length,
          players: match.info.participants.length,
        };
  return { average, players };
}
