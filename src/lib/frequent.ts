/**
 * Con quién juega seguido un jugador: compañeros que se repiten en sus últimas
 * 20 partidas. Las partidas ya están en caché si se abrió su perfil, así que
 * cuesta una consulta (la lista de partidas) y se guarda unas horas.
 */
import { cacheLife } from "next/cache";
import type { Platform } from "./constants";
import { getMatch, getMatchIds, type Match } from "./riot";

export interface FrequentMate {
  puuid: string;
  gameName: string;
  tagLine: string;
  games: number;
  wins: number;
}

export async function getFrequentMates(platform: Platform, puuid: string): Promise<FrequentMate[]> {
  "use cache";
  cacheLife("hours");
  const ids = await getMatchIds(platform, puuid, { count: 20 });
  const matches = (await Promise.all(ids.map((id) => getMatch(platform, id).catch(() => null)))).filter((m): m is Match => m !== null);
  const mates = new Map<string, FrequentMate>();
  for (const m of matches) {
    const me = m.info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;
    for (const p of m.info.participants) {
      if (p.teamId !== me.teamId || p.puuid === puuid || !p.riotIdGameName) continue;
      const t = mates.get(p.puuid) ?? { puuid: p.puuid, gameName: p.riotIdGameName, tagLine: p.riotIdTagline, games: 0, wins: 0 };
      t.games++;
      if (p.win) t.wins++;
      mates.set(p.puuid, t);
    }
  }
  return [...mates.values()].filter((t) => t.games >= 2).sort((a, b) => b.games - a.games);
}
