/**
 * Búsqueda en el índice local de jugadores (ver player-index.ts). Lee
 * data/players/<servidor>.json, que escribe el agregador, y
 * data/players/<servidor>.web.json, con los perfiles abiertos en la app (dos
 * archivos para que nunca escriban los dos procesos el mismo).
 */
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Platform } from "./constants";
import { normalizeName, upsertPlayer, type PlayerIndex, type PlayerRow, type PlayerSeen } from "./player-index";

const DATA_DIR = process.env.RIFTLAB_DATA_DIR ?? join(process.cwd(), "data");
const PLAYERS_DIR = join(DATA_DIR, "players");

const fileFor = (platform: Platform, web: boolean) => join(PLAYERS_DIR, `${platform}${web ? ".web" : ""}.json`);

/** Índices en memoria; se vuelven a leer cuando el archivo cambia. */
const cache = new Map<string, { mtime: number; index: PlayerIndex; names: Map<string, string> }>();

async function loadIndex(file: string) {
  let mtime = 0;
  try {
    mtime = (await stat(file)).mtimeMs;
  } catch {
    return null;
  }
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit;
  try {
    const index = JSON.parse(await readFile(file, "utf8")) as PlayerIndex;
    const names = new Map(Object.entries(index).map(([puuid, row]) => [puuid, normalizeName(row[0])]));
    const entry = { mtime, index, names };
    cache.set(file, entry);
    return entry;
  } catch {
    return hit ?? null;
  }
}

export interface PlayerSuggestion {
  puuid: string;
  gameName: string;
  tagLine: string;
  icon: number;
  level: number;
  tier: string | null;
  rank: string | null;
  lp: number | null;
}

/**
 * Jugadores cuyo nombre empieza con lo escrito (o lo contiene, más abajo).
 * "Nombre#TA" también filtra por el comienzo del tag.
 */
export async function searchPlayers(platform: Platform, query: string, limit = 6): Promise<PlayerSuggestion[]> {
  const hash = query.lastIndexOf("#");
  const name = normalizeName(hash >= 0 ? query.slice(0, hash) : query);
  const tag = hash >= 0 ? query.slice(hash + 1).trim().toLowerCase() : "";
  if (name.length < 2) return [];

  const sources = (await Promise.all([loadIndex(fileFor(platform, true)), loadIndex(fileFor(platform, false))])).filter(
    (s): s is NonNullable<typeof s> => s !== null,
  );
  const found = new Map<string, { row: PlayerRow; score: number }>();
  for (const { index, names } of sources) {
    for (const [puuid, n] of names) {
      if (found.has(puuid)) continue;
      const starts = n.startsWith(name);
      if (!starts && !n.includes(name)) continue;
      const row = index[puuid];
      if (tag && !row[1].toLowerCase().startsWith(tag)) continue;
      // Primero el nombre exacto, después los que empiezan igual; los que tienen rango conocido suben un poco.
      const score = (n === name ? 0 : starts ? 1 : 3) - (row[4] ? 0.5 : 0) - row[7] / 1e10;
      found.set(puuid, { row, score });
    }
  }
  return [...found]
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, limit)
    .map(([puuid, { row }]) => ({
      puuid,
      gameName: row[0],
      tagLine: row[1],
      icon: row[2],
      level: row[3],
      tier: row[4],
      rank: row[5],
      lp: row[6],
    }));
}

/** Guarda jugadores vistos al abrir un perfil (el dueño con su rango y los de sus partidas). */
export async function rememberPlayers(platform: Platform, seen: PlayerSeen[]): Promise<void> {
  if (!seen.length) return;
  const file = fileFor(platform, true);
  try {
    const current = (await loadIndex(file))?.index ?? {};
    const index: PlayerIndex = { ...current };
    for (const p of seen) upsertPlayer(index, p);
    await mkdir(PLAYERS_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(index));
  } catch {
    // Las sugerencias son un extra: si no se puede guardar, no pasa nada.
  }
}
