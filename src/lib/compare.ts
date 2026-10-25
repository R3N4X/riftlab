/**
 * Datos para comparar dos jugadores: cuenta, rango y resumen de sus últimas
 * 20 partidas, más las partidas que jugaron juntos o uno contra el otro.
 * Cuesta unas 5 consultas por jugador más las partidas que no estén en caché.
 */
import { ROLES, type Platform, type Role } from "./constants";
import {
  getAccountByRiotId,
  getLeagueEntries,
  getMatch,
  getMatchIds,
  getSummonerByPuuid,
  type Account,
  type LeagueEntry,
  type Match,
  type Summoner,
} from "./riot";

export interface PlayerSummary {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Promedios por partida o por minuto. */
  kp: number;
  csMin: number;
  dmgMin: number;
  goldMin: number;
  visionMin: number;
  mainRole: Role | null;
  champions: { championId: number; games: number; wins: number }[];
}

export interface ComparedPlayer {
  platform: Platform;
  account: Account;
  summoner: Summoner;
  solo: LeagueEntry | null;
  matches: Match[];
  summary: PlayerSummary;
}

export async function loadComparedPlayer(platform: Platform, gameName: string, tagLine: string): Promise<ComparedPlayer> {
  const account = await getAccountByRiotId(platform, gameName, tagLine);
  const [summoner, entries, ids] = await Promise.all([
    getSummonerByPuuid(platform, account.puuid),
    getLeagueEntries(platform, account.puuid),
    getMatchIds(platform, account.puuid, { count: 20 }),
  ]);
  const matches = (await Promise.all(ids.map((id) => getMatch(platform, id).catch(() => null)))).filter((m): m is Match => m !== null);
  return {
    platform,
    account,
    summoner,
    solo: entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null,
    matches,
    summary: summarize(matches, account.puuid),
  };
}

function summarize(matches: Match[], puuid: string): PlayerSummary {
  const out: PlayerSummary = {
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    kp: 0,
    csMin: 0,
    dmgMin: 0,
    goldMin: 0,
    visionMin: 0,
    mainRole: null,
    champions: [],
  };
  let minutes = 0;
  const roles = new Map<Role, number>();
  const champs = new Map<number, { championId: number; games: number; wins: number }>();
  for (const m of matches) {
    const me = m.info.participants.find((p) => p.puuid === puuid);
    if (!me || m.info.gameDuration < 300) continue;
    const teamKills = m.info.participants.filter((p) => p.teamId === me.teamId).reduce((s, p) => s + p.kills, 0);
    out.games++;
    if (me.win) out.wins++;
    out.kills += me.kills;
    out.deaths += me.deaths;
    out.assists += me.assists;
    out.kp += teamKills ? (me.kills + me.assists) / teamKills : 0;
    out.csMin += me.totalMinionsKilled + me.neutralMinionsKilled;
    out.dmgMin += me.totalDamageDealtToChampions;
    out.goldMin += me.goldEarned;
    out.visionMin += me.visionScore;
    minutes += m.info.gameDuration / 60;
    if (ROLES.includes(me.teamPosition as Role)) roles.set(me.teamPosition as Role, (roles.get(me.teamPosition as Role) ?? 0) + 1);
    const c = champs.get(me.championId) ?? { championId: me.championId, games: 0, wins: 0 };
    c.games++;
    if (me.win) c.wins++;
    champs.set(me.championId, c);
  }
  if (out.games) out.kp /= out.games;
  if (minutes) {
    out.csMin /= minutes;
    out.dmgMin /= minutes;
    out.goldMin /= minutes;
    out.visionMin /= minutes;
  }
  out.mainRole = [...roles].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  out.champions = [...champs.values()].sort((a, b) => b.games - a.games).slice(0, 3);
  return out;
}

export interface HeadToHead {
  together: { games: number; wins: number };
  against: { games: number; winsA: number };
}

/** Partidas en común entre las recientes de los dos. */
export function headToHead(a: ComparedPlayer, b: ComparedPlayer): HeadToHead {
  const seen = new Set<string>();
  const out: HeadToHead = { together: { games: 0, wins: 0 }, against: { games: 0, winsA: 0 } };
  for (const m of [...a.matches, ...b.matches]) {
    if (seen.has(m.metadata.matchId)) continue;
    seen.add(m.metadata.matchId);
    const pa = m.info.participants.find((p) => p.puuid === a.account.puuid);
    const pb = m.info.participants.find((p) => p.puuid === b.account.puuid);
    if (!pa || !pb) continue;
    if (pa.teamId === pb.teamId) {
      out.together.games++;
      if (pa.win) out.together.wins++;
    } else {
      out.against.games++;
      if (pa.win) out.against.winsA++;
    }
  }
  return out;
}
