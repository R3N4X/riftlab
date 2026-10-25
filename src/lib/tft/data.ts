/**
 * Datos de TFT. Unidades, rasgos y objetos del set actual salen de Community
 * Dragon (los mismos archivos del juego, ya en español); los resultados de
 * cada comp, de data/tft-meta.json (`npm run aggregate:tft`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { CDRAGON } from "../assets";
import type { TftDataset, TftStat } from "./types";

const DATA_DIR = process.env.RIFTLAB_DATA_DIR ?? join(process.cwd(), "data");
const DATASET_FILE = join(DATA_DIR, "tft-meta.json");

/* ---------- Catálogo del set (Community Dragon) ---------- */

export interface TftUnit {
  id: string;
  name: string;
  cost: number;
  traits: string[];
  icon: string;
  /** En la descripción, "X" marca valores que el juego calcula en partida. */
  ability: { name: string; desc: string };
  /** Alcance en hexágonos (1 = cuerpo a cuerpo), vida y armadura base: sirven para ubicarla en el tablero. */
  range: number;
  hp: number;
  armor: number;
}

export interface TftBreakpoint {
  min: number;
  /** 1 bronce, 2 plata, 3 oro, 4 prismático (la misma escala que las partidas). */
  style: number;
}

export interface TftTrait {
  id: string;
  name: string;
  icon: string;
  desc: string;
  breakpoints: TftBreakpoint[];
  units: string[];
}

export type TftItemKind = "component" | "combined" | "emblem" | "other";

export interface TftItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
  from: [string, string] | null;
  kind: TftItemKind;
}

export interface TftCatalog {
  set: number;
  units: Record<string, TftUnit>;
  traits: Record<string, TftTrait>;
  items: Record<string, TftItem>;
}

interface CdTrait {
  apiName: string;
  name: string;
  desc: string;
  icon: string;
  effects: { minUnits: number; maxUnits: number; style: number; variables: Record<string, number | null> }[];
}
interface CdChampion {
  apiName: string;
  name: string;
  cost: number;
  traits: string[];
  squareIcon?: string;
  tileIcon?: string;
  ability: { name: string; desc: string; variables: { name: string; value: (number | null)[] | null }[] };
  stats?: { range?: number | null; hp?: number | null; armor?: number | null };
}
interface CdItem {
  apiName: string;
  name: string;
  desc: string;
  icon: string;
  composition: string[];
  effects: Record<string, number | null>;
}
interface CdData {
  items: CdItem[];
  setData: { number: number; mutator: string; champions: CdChampion[]; traits: CdTrait[]; items: string[] }[];
}

/** Rutas .tex del juego → PNG servido por Community Dragon. */
export const cdragonAsset = (path: string) => `${CDRAGON}/game/${path.toLowerCase().replace(/\.(tex|dds)$/, ".png")}`;

/**
 * Community Dragon guarda muchas variables con el nombre en hash: FNV-1a de 32
 * bits del nombre en minúsculas, entre llaves ("{7a9d7f0e}").
 */
function hashName(name: string): string {
  let h = 0x811c9dc5;
  for (const ch of name.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `{${h.toString(16).padStart(8, "0")}}`;
}

/** Busca una variable por su nombre o por el hash del nombre. */
function pick<T>(vars: Record<string, T> | Map<string, T> | undefined, name: string): T | undefined {
  if (!vars) return undefined;
  if (vars instanceof Map) return vars.get(name) ?? vars.get(hashName(name));
  return vars[name] ?? vars[hashName(name)];
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * Las descripciones traen variables (@Damage@, @Pct*100@) y etiquetas del
 * cliente. Se reemplazan las variables conocidas; las que el juego calcula
 * en partida quedan como `unknown` ("?", o "X" en las habilidades, que dependen de estrellas y estadísticas).
 */
function cleanDesc(text: string, vars: (name: string) => string | null, unknown = "?"): string {
  return text
    .replace(/@([\w{}]+)(?:\*(\d+(?:\.\d+)?))?@/g, (_, name: string, mult?: string) => {
      const v = vars(name);
      if (v === null) return unknown;
      if (!mult) return v;
      return v
        .split("/")
        .map((x) => fmt(Number(x) * Number(mult)))
        .join("/");
    })
    .replace(/%i:[^%]+%/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:row|expandRow)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** El estilo de Community Dragon (1, 3, 4, 5, 6) llevado a la escala de las partidas (1 a 4). */
function normalizeStyle(style: number): number {
  return style <= 1 ? 1 : style <= 3 ? 2 : style <= 5 ? 3 : 4;
}

function itemKind(item: CdItem, components: Set<string>): TftItemKind {
  if (/_Component_/.test(item.apiName)) return "component";
  if (/Emblem/i.test(item.apiName)) return "emblem";
  if (item.composition.length === 2 && item.composition.every((c) => components.has(c))) return "combined";
  return "other";
}

async function loadCdragon(): Promise<CdData> {
  const res = await fetch(`${CDRAGON}/cdragon/tft/es_mx.json`);
  if (!res.ok) throw new Error(`Community Dragon respondió ${res.status}`);
  return (await res.json()) as CdData;
}

/** El set en juego: el de las partidas juntadas o, si no hay, el más nuevo publicado. */
export async function getTftCatalog(set?: number): Promise<TftCatalog> {
  "use cache";
  cacheLife("days");
  const data = await loadCdragon();
  const standard = data.setData.filter((s) => /^TFTSet\d+$/.test(s.mutator));
  const current = (set && standard.find((s) => s.number === set)) || standard.sort((a, b) => b.number - a.number)[0];

  const traitByName = new Map(current.traits.map((t) => [t.name, t.apiName]));
  const units: Record<string, TftUnit> = {};
  for (const c of current.champions) {
    if (!c.traits.length || c.cost < 1 || c.cost > 5) continue;
    const vars = new Map(c.ability.variables.map((v) => [v.name, v.value]));
    units[c.apiName] = {
      id: c.apiName,
      name: c.name,
      cost: c.cost,
      traits: c.traits.map((name) => traitByName.get(name)).filter((t): t is string => Boolean(t)),
      icon: cdragonAsset(c.tileIcon ?? c.squareIcon ?? ""),
      ability: {
        name: c.ability.name,
        desc: cleanDesc(c.ability.desc ?? "", (name) => {
          const v = pick(vars, name);
          return v ? v.slice(1, 4).map((x) => fmt(x ?? 0)).join("/") : null;
        }, "X"),
      },
      range: c.stats?.range ?? 1,
      hp: c.stats?.hp ?? 0,
      armor: c.stats?.armor ?? 0,
    };
  }

  const traits: Record<string, TftTrait> = {};
  for (const t of current.traits) {
    const members = Object.values(units).filter((u) => u.traits.includes(t.apiName));
    if (!members.length) continue;
    // El texto general usa las variables del primer escalón; cada fila, las suyas.
    const [intro, ...rows] = t.desc.split(/<(?:row|expandRow)>/i);
    const first = t.effects[0]?.variables ?? {};
    const lookup = (vars: Record<string, number | null>) => (name: string) => {
      if (name === "MinUnits") return null;
      const v = pick(vars, name);
      return typeof v === "number" ? fmt(v) : null;
    };
    const rowText = rows
      .map((row, i) => {
        const effect = t.effects[i];
        if (!effect) return "";
        return cleanDesc(row.replace(/@MinUnits@/g, String(effect.minUnits)), lookup(effect.variables));
      })
      .filter(Boolean);
    traits[t.apiName] = {
      id: t.apiName,
      name: t.name,
      icon: cdragonAsset(t.icon),
      desc: [cleanDesc(intro, lookup(first)), ...rowText].filter(Boolean).join("\n"),
      breakpoints: t.effects.map((e) => ({ min: e.minUnits, style: normalizeStyle(e.style) })),
      units: members.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "es")).map((u) => u.id),
    };
  }

  const setItems = new Set(current.items);
  const pool = data.items.filter((i) => setItems.has(i.apiName));
  const components = new Set(pool.filter((i) => /_Component_/.test(i.apiName)).map((i) => i.apiName));
  const items: Record<string, TftItem> = {};
  for (const i of pool) {
    const kind = itemKind(i, components);
    items[i.apiName] = {
      id: i.apiName,
      name: i.name,
      icon: cdragonAsset(i.icon),
      desc: cleanDesc(i.desc ?? "", (name) => {
        const v = pick(i.effects, name);
        return typeof v === "number" ? fmt(v) : null;
      }),
      from: kind === "combined" || kind === "emblem" ? [i.composition[0], i.composition[1]] : null,
      kind,
    };
  }

  return { set: current.number, units, traits, items };
}

/* ---------- Resultados de partidas ---------- */

export async function getTftDataset(): Promise<TftDataset | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const ds = JSON.parse(await readFile(DATASET_FILE, "utf8")) as TftDataset;
    return ds.boards > 0 ? ds : null;
  } catch {
    return null;
  }
}

export const avgPlace = (s: TftStat) => (s.games ? s.placeSum / s.games : 0);
export const top4Rate = (s: TftStat) => (s.games ? s.top4 / s.games : 0);
export const winRate = (s: TftStat) => (s.games ? s.wins / s.games : 0);

/** Colocación promedio encogida hacia 4,5 (el promedio de una partida) con muestras chicas. */
export const shrunkPlace = (s: TftStat, k = 20) => (s.placeSum + 4.5 * k) / (s.games + k);
