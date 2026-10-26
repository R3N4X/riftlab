/**
 * Cliente de Data Dragon (CDN público y oficial de Riot, sin API key).
 * Entrega campeones, objetos, runas, hechizos de invocador e íconos
 * para cada versión del juego.
 */
import { cacheLife } from "next/cache";
import { DDRAGON } from "./assets";

export { CDRAGON, DDRAGON, img, stripTags } from "./assets";
export const LOCALE = "es_MX";

/* ---------- Tipos ---------- */

export interface ChampionSummary {
  id: string; // "MonkeyKing"
  key: string; // "62"
  name: string; // "Wukong"
  title: string;
  tags: string[];
  partype: string;
  info: { attack: number; defense: number; magic: number; difficulty: number };
  stats: Record<string, number>;
  image: { full: string };
}

export interface ChampionSpell {
  id: string;
  name: string;
  description: string;
  tooltip: string;
  cooldownBurn: string;
  costBurn: string;
  rangeBurn: string;
  maxrank: number;
  image: { full: string };
}

export interface ChampionDetail extends ChampionSummary {
  lore: string;
  allytips: string[];
  enemytips: string[];
  skins: { id: string; num: number; name: string }[];
  spells: ChampionSpell[];
  passive: { name: string; description: string; image: { full: string } };
}

export interface Item {
  id: string;
  name: string;
  description: string;
  plaintext: string;
  gold: { base: number; total: number; sell: number; purchasable: boolean };
  tags: string[];
  from?: string[];
  into?: string[];
  depth?: number;
  maps: Record<string, boolean>;
  stats: Record<string, number>;
  requiredChampion?: string;
  requiredAlly?: string;
  inStore?: boolean;
}

export interface Rune {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc: string;
  longDesc: string;
}

export interface RuneTree {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: { runes: Rune[] }[];
}

export interface SummonerSpell {
  id: string; // "SummonerFlash"
  key: string; // "4"
  name: string;
  description: string;
  cooldownBurn: string;
  modes: string[];
  image: { full: string };
}

/* ---------- Fetch con caché ---------- */

// Con reintentos: un corte de un segundo dejaba el perfil entero en error, y como el error sale de
// una función con "use cache", en producción llegaba sin mensaje.
async function getJson<T>(url: string, attempts = 3): Promise<T> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Data Dragon ${res.status}: ${url}`);
    return (await res.json()) as T;
  } catch (err) {
    if (attempts <= 1) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return getJson<T>(url, attempts - 1);
  }
}

export async function getVersions(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  return getJson<string[]>(`${DDRAGON}/api/versions.json`);
}

export async function getLatestVersion(): Promise<string> {
  const versions = await getVersions();
  return versions[0];
}

/** "16.21.1" → "26.21" (nombre comercial del parche desde 2025). */
export function versionToPatch(version: string): string {
  const [major, minor] = version.split(".").map(Number);
  // 15.x = temporada 2025, 16.x = temporada 2026...
  const year = major >= 15 ? major + 10 : major;
  return `${year}.${minor}`;
}

export async function getChampions(version?: string): Promise<Record<string, ChampionSummary>> {
  "use cache";
  cacheLife("hours");
  const v = version ?? (await getLatestVersion());
  const json = await getJson<{ data: Record<string, ChampionSummary> }>(
    `${DDRAGON}/cdn/${v}/data/${LOCALE}/champion.json`,
  );
  return json.data;
}

export async function getChampionList(version?: string): Promise<ChampionSummary[]> {
  const champs = await getChampions(version);
  return Object.values(champs).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function getChampion(id: string, version?: string): Promise<ChampionDetail | null> {
  "use cache";
  cacheLife("hours");
  const v = version ?? (await getLatestVersion());
  const res = await fetch(`${DDRAGON}/cdn/${v}/data/${LOCALE}/champion/${id}.json`);
  if (!res.ok) return null;
  const json = (await res.json()) as { data: Record<string, ChampionDetail> };
  return json.data[id] ?? null;
}

/** Busca un campeón por id ("MonkeyKing"), key numérica ("62") o nombre ("wukong"). */
export async function resolveChampion(query: string): Promise<ChampionSummary | null> {
  const champs = await getChampions();
  const q = query.toLowerCase();
  return (
    Object.values(champs).find(
      (c) => c.id.toLowerCase() === q || c.key === query || c.name.toLowerCase() === q,
    ) ?? null
  );
}

export async function getChampionsByKey(): Promise<Record<string, ChampionSummary>> {
  const champs = await getChampions();
  return Object.fromEntries(Object.values(champs).map((c) => [c.key, c]));
}

export async function getItems(version?: string): Promise<Record<string, Item>> {
  "use cache";
  cacheLife("hours");
  const v = version ?? (await getLatestVersion());
  const json = await getJson<{ data: Record<string, Omit<Item, "id">> }>(
    `${DDRAGON}/cdn/${v}/data/${LOCALE}/item.json`,
  );
  return Object.fromEntries(Object.entries(json.data).map(([id, it]) => [id, { ...it, id }]));
}

export async function getRunes(version?: string): Promise<RuneTree[]> {
  "use cache";
  cacheLife("hours");
  const v = version ?? (await getLatestVersion());
  return getJson<RuneTree[]>(`${DDRAGON}/cdn/${v}/data/${LOCALE}/runesReforged.json`);
}

export async function getRuneIndex(): Promise<Record<number, Rune & { tree: string }>> {
  const trees = await getRunes();
  const index: Record<number, Rune & { tree: string }> = {};
  for (const tree of trees) {
    index[tree.id] = { id: tree.id, key: tree.key, icon: tree.icon, name: tree.name, shortDesc: "", longDesc: "", tree: tree.key };
    for (const slot of tree.slots) for (const r of slot.runes) index[r.id] = { ...r, tree: tree.key };
  }
  return index;
}

export async function getSummonerSpells(version?: string): Promise<Record<string, SummonerSpell>> {
  "use cache";
  cacheLife("hours");
  const v = version ?? (await getLatestVersion());
  const json = await getJson<{ data: Record<string, SummonerSpell> }>(
    `${DDRAGON}/cdn/${v}/data/${LOCALE}/summoner.json`,
  );
  // Indexado por key numérica, que es lo que entrega la API de partidas.
  return Object.fromEntries(Object.values(json.data).map((s) => [s.key, s]));
}
