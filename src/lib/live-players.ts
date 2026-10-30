/**
 * Datos de los 10 jugadores de una partida en curso, como la pantalla de carga
 * de Porofessor: rango y winrate de la temporada, maestría con el campeón que
 * eligió, sus últimas partidas y avisos (racha, primera vez con el campeón...).
 *
 * Cuesta ~21 consultas en el servidor y ~40 en la región (ids y 3 partidas por
 * jugador), así que todo se cachea y lo secundario se salta si la clave está
 * cerca del límite. Solo se pide una vez por partida.
 */
import { cacheLife } from "next/cache";
import { ROLES, type Platform, type Role, type Tier } from "./constants";
import { sortByLane } from "./lanes";
import {
  getActiveGame,
  getChampionMastery,
  getLeagueEntries,
  getMatch,
  getMatchIds,
  getTopMasteries,
  isRiotBusy,
  type ChampionMastery,
  type LeagueEntry,
  type Match,
} from "./riot";
import { getChampionRoleGames } from "./stats";

export interface LiveRecentGame {
  win: boolean;
  /** Línea que jugó en esa partida (null si no se sabe, por ejemplo en ARAM). */
  role: Role | null;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface LivePlayerInfo {
  puuid: string;
  gameName: string;
  tagLine: string;
  teamId: number;
  championId: number;
  spell1Id: number;
  spell2Id: number;
  isMe: boolean;
  rank: {
    tier: Tier;
    division: string;
    lp: number;
    wins: number;
    losses: number;
    hotStreak: boolean;
    veteran: boolean;
    freshBlood: boolean;
  } | null;
  /** Cola del rango mostrado ("RANKED_SOLO_5x5" o "RANKED_FLEX_SR"). */
  rankQueue: string | null;
  mastery: { level: number; points: number; lastPlayTime: number } | null;
  /** Últimas partidas (de la más nueva a la más vieja); null si no se pudieron pedir. */
  recent: LiveRecentGame[] | null;
  /** Línea estimada (solo en la Grieta); los equipos vienen ordenados de Superior a Soporte. */
  role: Role | null;
  /**
   * Línea que más juega: mezcla sus campeones con más maestría (según en qué línea se juega cada uno)
   * y las líneas de sus últimas partidas. `share` es qué parte de su juego representa (0 a 1).
   */
  mainRole: { role: Role; share: number } | null;
}

type RoleGames = Record<string, Partial<Record<Role, number>>>;

function mainRoleOf(top: ChampionMastery[] | null, recent: LiveRecentGame[] | null, roleGames: RoleGames | null): LivePlayerInfo["mainRole"] {
  const score = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  let weight = 0;
  // Maestría: cada campeón reparte sus puntos según en qué línea se juega (pesa 60 %).
  const totalPoints = top?.reduce((s, m) => s + m.championPoints, 0) ?? 0;
  if (top && roleGames && totalPoints > 0) {
    for (const m of top) {
      const games = roleGames[String(m.championId)] ?? {};
      const total = Object.values(games).reduce((s, g) => s + (g ?? 0), 0);
      if (!total) continue;
      for (const r of ROLES) score[r] += 0.6 * (m.championPoints / totalPoints) * ((games[r] ?? 0) / total);
    }
    weight += 0.6;
  }
  // Últimas partidas: lo que está jugando ahora (pesa 40 %).
  const withRole = recent?.filter((g) => g.role) ?? [];
  if (withRole.length) {
    for (const g of withRole) score[g.role!] += 0.4 / withRole.length;
    weight += 0.4;
  }
  if (!weight) return null;
  const best = ROLES.reduce((a, b) => (score[b] > score[a] ? b : a));
  const sum = ROLES.reduce((s, r) => s + score[r], 0) || 1;
  return { role: best, share: score[best] / sum };
}

export interface LiveGameInfo {
  gameId: number;
  queueId: number;
  startedAt: number;
  players: LivePlayerInfo[];
}

async function cachedLeague(platform: Platform, puuid: string): Promise<LeagueEntry[]> {
  "use cache";
  cacheLife("hours");
  return getLeagueEntries(platform, puuid);
}

async function cachedMastery(platform: Platform, puuid: string, championId: number): Promise<ChampionMastery | null> {
  "use cache";
  cacheLife("hours");
  return getChampionMastery(platform, puuid, championId);
}

async function cachedTopMasteries(platform: Platform, puuid: string): Promise<ChampionMastery[]> {
  "use cache";
  cacheLife("hours");
  return getTopMasteries(platform, puuid, 10);
}

async function cachedRecentIds(platform: Platform, puuid: string, queue?: number): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  return getMatchIds(platform, puuid, { count: 3, queue });
}

const RANKED = new Set([420, 440]);

export async function getLiveGameInfo(platform: Platform, puuid: string): Promise<LiveGameInfo | null> {
  const game = await getActiveGame(platform, puuid);
  if (!game) return null;
  const queue = RANKED.has(game.gameQueueConfigId) ? game.gameQueueConfigId : undefined;
  const preferred = game.gameQueueConfigId === 440 ? "RANKED_FLEX_SR" : "RANKED_SOLO_5x5";

  const classic = game.gameMode === "CLASSIC";
  const roleGames = classic ? await getChampionRoleGames().catch(() => null) : null;

  const players = await Promise.all(
    game.participants.map(async (p): Promise<LivePlayerInfo> => {
      const [gameName = "", tagLine = ""] = (p.riotId ?? "").split("#");
      const [entries, mastery, top] = await Promise.all([
        cachedLeague(platform, p.puuid).catch(() => null),
        cachedMastery(platform, p.puuid, p.championId).catch(() => null),
        classic ? cachedTopMasteries(platform, p.puuid).catch(() => null) : null,
      ]);
      const entry =
        entries?.find((e) => e.queueType === preferred) ??
        entries?.find((e) => e.queueType === (preferred === "RANKED_SOLO_5x5" ? "RANKED_FLEX_SR" : "RANKED_SOLO_5x5")) ??
        null;

      // Las últimas partidas son lo más caro: se saltan si la región está cerca del límite.
      let recent: LiveRecentGame[] | null = null;
      if (!isRiotBusy(platform, 55, true)) {
        const ids = await cachedRecentIds(platform, p.puuid, queue).catch(() => null);
        if (ids) {
          const matches = (await Promise.all(ids.map((id) => getMatch(platform, id).catch(() => null)))).filter(
            (m): m is Match => m !== null,
          );
          recent = matches.flatMap((m) => {
            const me = m.info.participants.find((x) => x.puuid === p.puuid);
            if (!me || m.info.gameDuration < 300) return [];
            const role = ROLES.includes(me.teamPosition as Role) ? (me.teamPosition as Role) : null;
            return [{ win: me.win, role, championId: me.championId, kills: me.kills, deaths: me.deaths, assists: me.assists }];
          });
        }
      }

      return {
        puuid: p.puuid,
        gameName,
        tagLine,
        teamId: p.teamId,
        championId: p.championId,
        spell1Id: p.spell1Id,
        spell2Id: p.spell2Id,
        isMe: p.puuid === puuid,
        rank: entry
          ? {
              tier: entry.tier as Tier,
              division: ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(entry.tier) ? "" : entry.rank,
              lp: entry.leaguePoints,
              wins: entry.wins,
              losses: entry.losses,
              hotStreak: entry.hotStreak,
              veteran: entry.veteran,
              freshBlood: entry.freshBlood,
            }
          : null,
        rankQueue: entry?.queueType ?? null,
        mastery: mastery ? { level: mastery.championLevel, points: mastery.championPoints, lastPlayTime: mastery.lastPlayTime } : null,
        recent,
        role: null,
        mainRole: classic ? mainRoleOf(top, recent, roleGames) : null,
      };
    }),
  );

  // En la Grieta cada equipo se ordena por línea: así cada jugador queda frente a su rival.
  if (classic) {
    if (roleGames) {
      const sorted = [100, 200].flatMap((teamId) =>
        sortByLane(players.filter((p) => p.teamId === teamId), roleGames).map(({ player, role }) => ({ ...player, role })),
      );
      if (sorted.length === players.length) players.splice(0, players.length, ...sorted);
    }
  }

  return { gameId: game.gameId, queueId: game.gameQueueConfigId, startedAt: game.gameStartTime, players };
}
