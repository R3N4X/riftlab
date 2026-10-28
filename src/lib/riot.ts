/**
 * Cliente de la API oficial de Riot Games (developer.riotgames.com).
 * Usa RIOT_API_KEY (Ajustes o .env.local) y, si no hay, el intermediario del grupo
 * (RIFTLAB_PROXY_URL + RIFTLAB_PROXY_CODE), que guarda la clave en Cloudflare.
 *
 * Límites de una Development Key: 20 req/s y 100 req/2 min.
 * Para producción hay que pedir una Production Key a Riot.
 */
import { cacheLife } from "next/cache";
import { PLATFORMS, type Platform } from "./constants";

export class RiotApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Segundos que Riot pide esperar (solo en 429). */
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/*
 * Cuenta de consultas de esta app por host en los últimos 2 minutos y bloqueo tras un 429.
 * Con la clave de desarrollo el límite es 100 cada 2 min, compartido con el agregador:
 * lo secundario (como el rango de cada jugador de una partida) se salta si el perfil
 * se está quedando sin consultas, y tras un 429 no se insiste hasta que pase la espera.
 */
const WINDOW_MS = 120_000;
const recentCalls = new Map<string, number[]>();
const blockedUntil = new Map<string, number>();

function callsInWindow(host: string): number {
  const now = Date.now();
  const list = (recentCalls.get(host) ?? []).filter((t) => now - t < WINDOW_MS);
  recentCalls.set(host, list);
  return list.length;
}

/** true si conviene no gastar consultas en cosas secundarias en ese servidor (o región, con regional). */
export function isRiotBusy(platform: Platform, maxCalls = 45, regional = false): boolean {
  const host = regional ? PLATFORMS[platform].region : platform;
  return (blockedUntil.get(host) ?? 0) > Date.now() || callsInWindow(host) >= maxCalls;
}

/** Intermediario del grupo: solo se usa cuando no hay clave propia. */
function groupProxy(): { url: string; code: string } | null {
  const url = process.env.RIFTLAB_PROXY_URL;
  const code = process.env.RIFTLAB_PROXY_CODE;
  return !process.env.RIOT_API_KEY && url && code ? { url: url.replace(/\/+$/, ""), code } : null;
}

const limitMessage = () =>
  groupProxy()
    ? "Se alcanzó el límite de consultas que comparte el grupo (100 cada 2 minutos)."
    : "Se alcanzó el límite de consultas de la clave de Riot (100 cada 2 minutos).";

/** Mensaje para mostrar de cualquier error al cargar datos de Riot o de Data Dragon. */
export function errorMessage(err: unknown): string {
  if (err instanceof RiotApiError) return err.message;
  // Los errores de funciones con "use cache" llegan en producción sin su mensaje real (en inglés).
  return "No se pudo conectar con los servidores de Riot. Suele ser un corte momentáneo de internet: se reintenta solo.";
}

export function hasRiotKey(): boolean {
  return Boolean(process.env.RIOT_API_KEY || groupProxy());
}

function regionOf(platform: Platform): string {
  return PLATFORMS[platform].region;
}

/** account-v1 solo existe en americas / europe / asia. */
function accountRegionOf(platform: Platform): string {
  const r = regionOf(platform);
  return r === "sea" ? "asia" : r;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function riotFetch<T>(host: string, path: string, retries = 3): Promise<T> {
  const key = process.env.RIOT_API_KEY;
  const proxy = groupProxy();
  if (!key && !proxy) throw new RiotApiError(401, "Falta la clave de la API de Riot");

  const blocked = (blockedUntil.get(host) ?? 0) - Date.now();
  if (blocked > 0) throw new RiotApiError(429, limitMessage(), Math.ceil(blocked / 1000));
  callsInWindow(host);
  recentCalls.get(host)!.push(Date.now());

  let res: Response;
  try {
    res = proxy
      ? await fetch(`${proxy.url}/${host}${path}`, { headers: { "X-RiftLab-Code": proxy.code }, signal: AbortSignal.timeout(15_000) })
      : await fetch(`https://${host}.api.riotgames.com${path}`, { headers: { "X-Riot-Token": key! }, signal: AbortSignal.timeout(15_000) });
  } catch {
    // Sin conexión o sin respuesta: se reintenta una vez antes de avisar.
    if (retries > 0) {
      await sleep(1000);
      return riotFetch<T>(host, path, Math.min(retries - 1, 1));
    }
    throw new RiotApiError(503, errorMessage(null));
  }

  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get("retry-after") ?? "2") * 1000;
    // Solo se espera si es corto: con el límite de 2 minutos agotado la página quedaba cargando
    // varios minutos sin explicación; es mejor mostrar el aviso y que se reintente con Actualizar.
    if (wait <= 5000) {
      await sleep(wait);
      return riotFetch<T>(host, path, retries - 1);
    }
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") ?? "30");
    blockedUntil.set(host, Date.now() + wait * 1000);
    throw new RiotApiError(429, limitMessage(), wait);
  }
  if (res.status >= 500 && retries > 0) {
    await sleep(1000);
    return riotFetch<T>(host, path, retries - 1);
  }
  if (!res.ok) {
    const msg =
      res.status === 404
        ? "No encontrado"
        : res.headers.get("x-riftlab-proxy") === "denied"
          ? "El servidor del grupo no aceptó esta versión de RiftLab: actualiza la app."
          : res.status === 401 || res.status === 403
            ? proxy
              ? "Riot rechazó la clave del servidor del grupo: avísale a quien lo administra."
              : "API key inválida o vencida (las Development Keys duran 24 h)"
            : `Error ${res.status} de la API de Riot`;
    throw new RiotApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

/* ---------- Tipos (subconjunto de lo que devuelve Riot) ---------- */

export interface Account {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface Summoner {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
  revisionDate: number;
}

export interface LeagueEntry {
  queueType: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" | string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  miniSeries?: { progress: string };
  puuid: string;
}

export interface ChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  championPointsSinceLastLevel?: number;
  championPointsUntilNextLevel?: number;
}

export interface MatchParticipant {
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  profileIcon?: number;
  summonerLevel?: number;
  championId: number;
  championName: string;
  champLevel: number;
  teamId: number;
  teamPosition: string;
  individualPosition: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  damageDealtToObjectives?: number;
  visionScore: number;
  wardsPlaced: number;
  controlWardsPlaced?: number;
  wardsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  firstBloodKill: boolean;
  gameEndedInEarlySurrender: boolean;
  perks: {
    styles: { description: string; style: number; selections: { perk: number }[] }[];
    statPerks: { offense: number; flex: number; defense: number };
  };
  challenges?: {
    kda?: number;
    killParticipation?: number;
    damagePerMinute?: number;
    goldPerMinute?: number;
    soloKills?: number;
    visionScorePerMinute?: number;
    laneMinionsFirst10Minutes?: number;
  };
}

export interface Match {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp?: number;
    gameMode: string;
    gameVersion: string;
    queueId: number;
    participants: MatchParticipant[];
    teams: {
      teamId: number;
      win: boolean;
      bans: { championId: number; pickTurn: number }[];
      objectives: Record<string, { first: boolean; kills: number }>;
    }[];
  };
}

export interface MatchTimeline {
  info: {
    frames: {
      timestamp: number;
      events: { type: string; participantId?: number; skillSlot?: number; itemId?: number; timestamp: number }[];
    }[];
    participants: { participantId: number; puuid: string }[];
  };
}

export interface ActiveGame {
  gameId: number;
  gameMode: string;
  gameQueueConfigId: number;
  gameStartTime: number;
  gameLength: number;
  participants: {
    puuid: string;
    riotId?: string;
    championId: number;
    teamId: number;
    spell1Id: number;
    spell2Id: number;
    perks?: { perkIds: number[]; perkStyle: number; perkSubStyle: number };
  }[];
  bannedChampions: { championId: number; teamId: number; pickTurn: number }[];
}

/* ---------- Endpoints ---------- */

export async function getAccountByRiotId(platform: Platform, gameName: string, tagLine: string) {
  return riotFetch<Account>(
    accountRegionOf(platform),
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
}

const puuidByRiotId = new Map<string, string>();

/**
 * El cliente de League entrega el puuid sin cifrar para nuestra clave: la API lo rechaza con 400
 * ("Exception decrypting"). Con el Riot ID se consigue el puuid que sí entiende la clave.
 * Si no hay Riot ID o la búsqueda falla, se usa el puuid recibido.
 */
export async function apiPuuid(platform: Platform, riotId: string | null | undefined, fallback: string): Promise<string> {
  const hash = riotId?.lastIndexOf("#") ?? -1;
  if (!riotId || hash <= 0 || hash === riotId.length - 1) return fallback;
  const key = `${accountRegionOf(platform)}:${riotId.toLowerCase()}`;
  const cached = puuidByRiotId.get(key);
  if (cached) return cached;
  try {
    const account = await getAccountByRiotId(platform, riotId.slice(0, hash), riotId.slice(hash + 1));
    puuidByRiotId.set(key, account.puuid);
    return account.puuid;
  } catch {
    return fallback;
  }
}

export async function getSummonerByPuuid(platform: Platform, puuid: string) {
  return riotFetch<Summoner>(platform, `/lol/summoner/v4/summoners/by-puuid/${puuid}`);
}

export async function getLeagueEntries(platform: Platform, puuid: string) {
  return riotFetch<LeagueEntry[]>(platform, `/lol/league/v4/entries/by-puuid/${puuid}`);
}

export async function getTopMasteries(platform: Platform, puuid: string, count = 10) {
  return riotFetch<ChampionMastery[]>(platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`);
}

/** Maestría con todos los campeones que jugó alguna vez, de más a menos puntos. */
export async function getAllMasteries(platform: Platform, puuid: string) {
  return riotFetch<ChampionMastery[]>(platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`);
}

/** Puntaje de maestría: la suma de los niveles de todos sus campeones. */
export async function getMasteryScore(platform: Platform, puuid: string) {
  return riotFetch<number>(platform, `/lol/champion-mastery/v4/scores/by-puuid/${puuid}`);
}

/** Maestría con un campeón; null si nunca lo jugó. */
export async function getChampionMastery(platform: Platform, puuid: string, championId: number): Promise<ChampionMastery | null> {
  try {
    return await riotFetch<ChampionMastery>(
      platform,
      `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/by-champion/${championId}`,
    );
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getMatchIds(platform: Platform, puuid: string, opts: { count?: number; start?: number; queue?: number } = {}) {
  const q = new URLSearchParams({ start: String(opts.start ?? 0), count: String(opts.count ?? 20) });
  if (opts.queue) q.set("queue", String(opts.queue));
  return riotFetch<string[]>(regionOf(platform), `/lol/match/v5/matches/by-puuid/${puuid}/ids?${q}`);
}

/** Una partida terminada no cambia nunca: se cachea por días. */
export async function getMatch(platform: Platform, matchId: string) {
  "use cache";
  cacheLife("days");
  return riotFetch<Match>(regionOf(platform), `/lol/match/v5/matches/${matchId}`);
}

export async function getMatchTimeline(platform: Platform, matchId: string) {
  return riotFetch<MatchTimeline>(regionOf(platform), `/lol/match/v5/matches/${matchId}/timeline`);
}

export async function getActiveGame(platform: Platform, puuid: string): Promise<ActiveGame | null> {
  try {
    return await riotFetch<ActiveGame>(platform, `/lol/spectator/v5/active-games/by-summoner/${puuid}`);
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 404) return null;
    throw err;
  }
}

/* ---------- Riot ID en URLs ---------- */

/** "Faker#KR1" → "Faker-KR1" (mismo formato que usan op.gg y similares). */
export function riotIdToSlug(gameName: string, tagLine: string): string {
  return encodeURIComponent(`${gameName}-${tagLine}`);
}

/** "Faker-KR1" → { gameName: "Faker", tagLine: "KR1" }. El tag va después del último guion. */
export function slugToRiotId(slug: string): { gameName: string; tagLine: string } | null {
  const decoded = decodeURIComponent(slug).replace("#", "-");
  const idx = decoded.lastIndexOf("-");
  if (idx <= 0 || idx === decoded.length - 1) return null;
  return { gameName: decoded.slice(0, idx), tagLine: decoded.slice(idx + 1) };
}
