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
  /**
   * Grupo de premades: los jugadores del mismo equipo con el mismo `group` jugaron juntos en sus
   * últimas partidas. `games` es cuántas de esas partidas compartió con alguien del grupo.
   */
  premade: { group: number; games: number } | null;
  /**
   * Ya te tocó en una de tus últimas partidas (sin contar a tus premades). `gamesAgo` es 1 si fue en
   * tu partida anterior; `ally` dice si estuvo en tu equipo; `win` es tu resultado esa vez.
   */
  metBefore: { gamesAgo: number; games: number; ally: boolean; win: boolean; championId: number } | null;
}

/** Cuántas de tus partidas anteriores se revisan para "ya te tocó". */
const MET_WINDOW = 5;

/** Jugadores de esta partida que ya estuvieron en alguna de tus últimas partidas, por puuid. */
function findMetBefore(players: LivePlayerInfo[], me: string, myMatches: Match[]): Map<string, NonNullable<LivePlayerInfo["metBefore"]>> {
  const result = new Map<string, NonNullable<LivePlayerInfo["metBefore"]>>();
  const self = players.find((p) => p.puuid === me);
  for (const p of players) {
    if (!p.puuid || p.puuid === me) continue;
    // Con tus premades ya se sabe que juegan juntos.
    if (self?.premade && p.teamId === self.teamId && p.premade?.group === self.premade.group) continue;
    for (const [i, m] of myMatches.entries()) {
      const mine = m.info.participants.find((x) => x.puuid === me);
      const theirs = m.info.participants.find((x) => x.puuid === p.puuid);
      if (!mine || !theirs) continue;
      const seen = result.get(p.puuid);
      if (seen) seen.games++;
      else result.set(p.puuid, { gamesAgo: i + 1, games: 1, ally: mine.teamId === theirs.teamId, win: mine.win, championId: theirs.championId });
    }
  }
  return result;
}

/**
 * Premades: Riot no dice quién entró en grupo, pero se deduce de las últimas partidas que ya se
 * piden para "Últimas" (sin consultas extra): dos jugadores del mismo equipo que en alguna de
 * ellas estuvieron en el mismo equipo. Con una sola partida juntos puede ser casualidad (sobre todo
 * en rangos altos, donde juegan pocos), por eso la pantalla distingue 1 partida de 2 o más.
 */
function findPremades(players: LivePlayerInfo[], matchesOf: Map<string, Match[]>): Map<string, { group: number; games: number }> {
  const parent = new Map(players.map((p) => [p.puuid, p.puuid]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const together = new Map<string, number>();

  for (const [i, a] of players.entries()) {
    for (const b of players.slice(i + 1)) {
      // Riot oculta el puuid de algunos jugadores (llega vacío): con ellos no se puede saber.
      if (a.teamId !== b.teamId || !a.puuid || !b.puuid) continue;
      // Las partidas de los dos, sin repetir las que ya aparecen en ambas listas.
      const seen = new Set<string>();
      let games = 0;
      for (const m of [...(matchesOf.get(a.puuid) ?? []), ...(matchesOf.get(b.puuid) ?? [])]) {
        if (seen.has(m.metadata.matchId)) continue;
        seen.add(m.metadata.matchId);
        const pa = m.info.participants.find((x) => x.puuid === a.puuid);
        const pb = m.info.participants.find((x) => x.puuid === b.puuid);
        if (pa && pb && pa.teamId === pb.teamId) games++;
      }
      if (!games) continue;
      parent.set(find(a.puuid), find(b.puuid));
      for (const id of [a.puuid, b.puuid]) together.set(id, Math.max(together.get(id) ?? 0, games));
    }
  }

  // Un número por grupo, en el orden de la partida.
  const numbers = new Map<string, number>();
  const result = new Map<string, { group: number; games: number }>();
  for (const p of players) {
    const games = together.get(p.puuid);
    if (!games) continue;
    const root = find(p.puuid);
    if (!numbers.has(root)) numbers.set(root, numbers.size + 1);
    result.set(p.puuid, { group: numbers.get(root)!, games });
  }
  return result;
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
  // Partidas recientes de cada jugador, también para encontrar premades.
  const matchesOf = new Map<string, Match[]>();

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
          matchesOf.set(p.puuid, matches);
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
        premade: null,
        metBefore: null,
      };
    }),
  );

  const premades = findPremades(players, matchesOf);
  for (const p of players) p.premade = premades.get(p.puuid) ?? null;

  // Tus partidas anteriores de cualquier cola (sin caché: la anterior pudo terminar hace un minuto).
  const myIds = isRiotBusy(platform, 55, true) ? null : await getMatchIds(platform, puuid, { count: MET_WINDOW }).catch(() => null);
  if (myIds?.length) {
    const myMatches = (await Promise.all(myIds.map((id) => getMatch(platform, id).catch(() => null)))).filter(
      (m): m is Match => m !== null,
    );
    const met = findMetBefore(players, puuid, myMatches);
    for (const p of players) p.metBefore = met.get(p.puuid) ?? null;
  }

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
