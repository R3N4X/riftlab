/**
 * Consultas sobre el dataset agregado: tier list, builds, enfrentamientos y
 * sinergias. Lee `data/meta.json` (generado con datos reales por
 * `npm run aggregate`); mientras no alcanza, el último parche archivado en
 * data/patches/ o, si no hay, el dataset de demostración.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { RANK_FILTERS, ROLES, TIER_GRADES, type RankFilter, type Role, type TierGrade } from "../constants";
import { getChampionList, getChampionsByKey, getItems, getLatestVersion, versionToPatch, type ChampionSummary } from "../ddragon";
import { buildDemoDataset } from "./demo";
import { pairKey } from "./keys";
import type { CountMap, Counts, GameLength, MetaDataset, RoleAgg, TierCounts } from "./types";

export type { MetaDataset } from "./types";

// La app de escritorio indica dónde está la carpeta data (el servidor standalone corre en otra carpeta).
const DATA_DIR = process.env.RIFTLAB_DATA_DIR ?? join(process.cwd(), "data");
const DATASET_FILE = join(DATA_DIR, "meta.json");
const ARCHIVE_DIR = join(DATA_DIR, "patches");

let demoCache: { patch: string; data: Promise<MetaDataset> } | null = null;

/**
 * Con menos partidas reales que esto, los porcentajes no dicen nada y la
 * mayoría de campeones ni aparece; mientras el agregador junta datos se
 * sigue mostrando el dataset de demostración (con aviso del avance).
 */
export const MIN_REAL_MATCHES = 1000;

async function readRealDataset(): Promise<MetaDataset | null> {
  try {
    return JSON.parse(await readFile(DATASET_FILE, "utf8")) as MetaDataset;
  } catch {
    return null;
  }
}

/** El parche archivado más reciente con muestra suficiente (data/patches/<parche>.json). */
async function readLatestArchive(): Promise<MetaDataset | null> {
  let files: string[];
  try {
    files = (await readdir(ARCHIVE_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  const byPatch = (f: string) =>
    f
      .replace(/\.json$/, "")
      .split("-")[0]
      .split(".")
      .map(Number);
  files.sort((a, b) => {
    const [am, an] = byPatch(a);
    const [bm, bn] = byPatch(b);
    return bm - am || bn - an || b.localeCompare(a);
  });
  for (const file of files) {
    try {
      const ds = JSON.parse(await readFile(join(ARCHIVE_DIR, file), "utf8")) as MetaDataset;
      if (matchesIn(ds, "ALL") >= MIN_REAL_MATCHES) return ds;
    } catch {
      // archivo dañado: se prueba con el siguiente
    }
  }
  return null;
}

async function loadDemoDataset(): Promise<MetaDataset> {
  const version = await getLatestVersion();
  const patch = versionToPatch(version);
  if (!demoCache || demoCache.patch !== patch) {
    demoCache = {
      patch,
      data: Promise.all([getChampionList(version), getItems(version)]).then(([champs, items]) => buildDemoDataset(patch, champs, items)),
    };
  }
  return demoCache.data;
}

/**
 * Orden de preferencia: parche actual con muestra suficiente → último parche
 * archivado (mientras el agregador junta el nuevo) → dataset de demostración.
 */
async function loadDataset(): Promise<MetaDataset> {
  const real = await readRealDataset();
  if (real && matchesIn(real, "ALL") >= MIN_REAL_MATCHES) return real;
  return (await readLatestArchive()) ?? loadDemoDataset();
}

/* ---------- Utilidades ---------- */

function sumTiers(byTier: TierCounts | undefined, rank: RankFilter): Counts {
  const out = { games: 0, wins: 0 };
  if (!byTier) return out;
  for (const t of RANK_FILTERS[rank].tiers) {
    const c = byTier[t];
    if (c) {
      out.games += c.games;
      out.wins += c.wins;
    }
  }
  return out;
}

function matchesIn(ds: MetaDataset, rank: RankFilter): number {
  return RANK_FILTERS[rank].tiers.reduce((s, t) => s + (ds.matches[t] ?? 0), 0);
}

function bansIn(bans: Partial<Record<string, number>>, rank: RankFilter): number {
  return RANK_FILTERS[rank].tiers.reduce((s, t) => s + (bans[t] ?? 0), 0);
}

/**
 * Muestra mínima para mostrar un dato. Los umbrales están pensados para
 * ~20 000 partidas; con muestras chicas (p. ej. una corrida corta del
 * agregador) se escalan hacia abajo para no dejar las páginas vacías.
 */
function minSample(ds: MetaDataset, base: number): number {
  const total = matchesIn(ds, "ALL");
  const factor = Math.min(1, Math.max(0.02, total / 20000));
  return Math.max(2, Math.round(base * factor));
}

/** Tasa de victorias suavizada hacia 50 % para muestras chicas. */
/**
 * Diferencia de winrate frente a una base, encogida hacia 0 con muestras
 * chicas: con pocas partidas se parte de la base (no de 50 %), así un dúo que
 * pierde nunca aparece con "sinergia positiva" solo por tener pocos datos.
 */
function shrunkDelta(c: Counts, base: number, k: number): number {
  return (c.wins + base * k) / (c.games + k) - base;
}

// k alto: un campeón con ~100 partidas en un rol poco común no debe quedar primero solo por suerte.
function smoothedWr(c: Counts, k = 150): number {
  return (c.wins + 0.5 * k) / (c.games + k);
}

export interface Stat {
  key: string;
  games: number;
  wins: number;
  winRate: number;
  /** Porcentaje sobre las partidas del campeón en ese rol. */
  share: number;
}

function top(map: CountMap | undefined, total: number, n: number, minGames = 1): Stat[] {
  if (!map) return [];
  return Object.entries(map)
    .filter(([, c]) => c.games >= minGames)
    .sort((a, b) => b[1].games - a[1].games)
    .slice(0, n)
    .map(([key, c]) => ({ key, games: c.games, wins: c.wins, winRate: c.wins / c.games, share: total ? c.games / total : 0 }));
}

/**
 * Núcleo de 3 objetos. Las combinaciones exactas se reparten mucho (cuenta el
 * orden de compra): con poca muestra ninguna llega al mínimo y la build quedaba
 * sin objetos principales. Entonces se completa con los objetos que más se
 * repiten entre todas las combinaciones, en el orden en que suelen comprarse.
 */
function coreItems(map: CountMap | undefined, total: number, n: number, minGames: number): Stat[] {
  const exact = top(map, total, n, minGames);
  if (exact.length >= 3 || !map) return exact;

  const items = new Map<string, { games: number; pos: number }>();
  for (const [key, c] of Object.entries(map)) {
    key.split("-").forEach((id, i) => {
      const e = items.get(id) ?? { games: 0, pos: 0 };
      e.games += c.games;
      e.pos += i * c.games;
      items.set(id, e);
    });
  }
  const ranked = [...items].sort((a, b) => b[1].games - a[1].games).map(([id]) => id);
  const avgPos = (id: string) => items.get(id)!.pos / items.get(id)!.games;
  const seen = new Set(exact.map((st) => st.key.split("-").sort().join("-")));
  const out = [...exact];
  // Los 3 más repetidos y, como alternativas, cambiando el tercero por el 4.º o el 5.º.
  for (const variant of [
    [0, 1, 2],
    [0, 1, 3],
    [0, 1, 4],
  ]) {
    if (out.length >= n || variant.some((i) => i >= ranked.length)) continue;
    const ids = variant.map((i) => ranked[i]).sort((a, b) => avgPos(a) - avgPos(b));
    const signature = [...ids].sort().join("-");
    if (seen.has(signature)) continue;
    seen.add(signature);
    // Resultado de las partidas que armaron al menos dos de estos objetos.
    let games = 0;
    let wins = 0;
    for (const [key, c] of Object.entries(map)) {
      const bought = key.split("-");
      if (ids.filter((id) => bought.includes(id)).length >= 2) {
        games += c.games;
        wins += c.wins;
      }
    }
    if (games) out.push({ key: ids.join("-"), games, wins, winRate: wins / games, share: total ? games / total : 0 });
  }
  return out;
}

/**
 * Páginas de runas más usadas. Si ninguna página completa se repite lo
 * suficiente (rol con pocas partidas), se arma la más común casilla por
 * casilla: rama principal, cada fila, par secundario y fragmentos.
 */
function runePages(map: CountMap | undefined, total: number, n: number, minGames: number): Stat[] {
  const exact = top(map, total, n, minGames);
  if (exact.length || !map) return exact;

  const pages = Object.entries(map).map(([key, c]) => {
    const [primary, secondary, shards] = key.split("|");
    const [pTree, pRunes] = primary.split(":");
    const [sTree, sRunes] = secondary.split(":");
    return { pTree, pRunes: pRunes.split(","), sTree, sRunes, shards, c };
  });
  const most = (values: [string, number][]) => {
    const tally = new Map<string, number>();
    for (const [v, g] of values) tally.set(v, (tally.get(v) ?? 0) + g);
    return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  };

  const pTree = most(pages.map((p) => [p.pTree, p.c.games]));
  const pool = pages.filter((p) => p.pTree === pTree);
  if (!pTree || !pool.length) return [];
  const slots = [0, 1, 2, 3].map((i) => most(pool.map((p) => [p.pRunes[i], p.c.games])));
  const sTree = most(pool.map((p) => [p.sTree, p.c.games]));
  const sPool = pool.filter((p) => p.sTree === sTree);
  // El par secundario va completo (dos runas de filas distintas, como en una página real).
  const sRunes = most(sPool.map((p) => [p.sRunes, p.c.games]));
  const shards = most(pool.map((p) => [p.shards, p.c.games]));
  if (slots.some((x) => !x) || !sTree || !sRunes || !shards) return [];

  const games = pool.reduce((sum, p) => sum + p.c.games, 0);
  const wins = pool.reduce((sum, p) => sum + p.c.wins, 0);
  return [
    {
      key: `${pTree}:${slots.join(",")}|${sTree}:${sRunes}|${shards}`,
      games,
      wins,
      winRate: games ? wins / games : 0,
      share: total ? games / total : 0,
    },
  ];
}

/* ---------- Info general ---------- */

export interface DatasetInfo {
  source: MetaDataset["source"];
  patch: string;
  generatedAt: string;
  platforms: string[];
  totalMatches: number;
  /** Avance del dataset real mientras todavía no alcanza para mostrarse. */
  collecting: { matches: number; needed: number; patch: string; platforms: string[] } | null;
}

export async function getDatasetInfo(): Promise<DatasetInfo> {
  "use cache";
  cacheLife("minutes");
  const [ds, real] = await Promise.all([loadDataset(), readRealDataset()]);
  const realMatches = real ? matchesIn(real, "ALL") : 0;
  return {
    source: ds.source,
    patch: ds.patch,
    generatedAt: ds.generatedAt,
    platforms: ds.platforms,
    totalMatches: matchesIn(ds, "ALL"),
    collecting:
      real && realMatches < MIN_REAL_MATCHES
        ? { matches: realMatches, needed: MIN_REAL_MATCHES, patch: real.patch, platforms: real.platforms }
        : null,
  };
}

/* ---------- Tier list ---------- */

export interface TierRow {
  champion: Pick<ChampionSummary, "id" | "key" | "name" | "tags">;
  role: Role;
  games: number;
  winRate: number;
  pickRate: number;
  banRate: number;
  score: number;
  tier: TierGrade;
  /** Posición dentro de su rol. */
  rank: number;
  /** Rivales más difíciles (keys). */
  counters: string[];
}

const GRADE_CUTS = [0.05, 0.16, 0.38, 0.66, 0.87]; // percentiles acumulados → S+, S, A, B, C, D

function computeRoleRows(ds: MetaDataset, rank: RankFilter, champsByKey: Record<string, ChampionSummary>): TierRow[] {
  const matches = matchesIn(ds, rank) || 1;
  const rows: TierRow[] = [];

  for (const role of ROLES) {
    const roleRows: TierRow[] = [];
    for (const [key, agg] of Object.entries(ds.champions)) {
      const champ = champsByKey[key];
      const roleAgg = agg.roles[role];
      if (!champ || !roleAgg) continue;
      const c = sumTiers(roleAgg.byTier, rank);
      const pickRate = c.games / matches;
      if (c.games < minSample(ds, 40) || pickRate < 0.004) continue;

      // Los bloqueos son del campeón, no del rol: se reparten según su peso en cada rol.
      const champGames = Object.values(agg.roles).reduce((s, r) => s + sumTiers(r?.byTier, rank).games, 0) || 1;
      const banRate = (bansIn(agg.bans, rank) / matches) * (c.games / champGames);
      const winRate = c.wins / c.games;
      const score = (smoothedWr(c) - 0.5) * 100 + 0.9 * Math.log(1 + pickRate * 100) + 0.06 * banRate * 100;

      const counters = Object.entries(roleAgg.matchups)
        .filter(([, m]) => m.games >= minSample(ds, 30))
        .sort((a, b) => a[1].wins / a[1].games - b[1].wins / b[1].games)
        .slice(0, 3)
        .map(([k]) => k);

      roleRows.push({
        champion: { id: champ.id, key: champ.key, name: champ.name, tags: champ.tags },
        role,
        games: c.games,
        winRate,
        pickRate,
        banRate,
        score,
        tier: "D",
        rank: 0,
        counters,
      });
    }
    roleRows.sort((a, b) => b.score - a.score);
    roleRows.forEach((row, i) => {
      const pct = (i + 0.5) / roleRows.length;
      const idx = GRADE_CUTS.findIndex((cut) => pct <= cut);
      row.tier = TIER_GRADES[idx === -1 ? TIER_GRADES.length - 1 : idx];
      row.rank = i + 1;
    });
    rows.push(...roleRows);
  }
  return rows;
}

export async function getTierList(rank: RankFilter, role: Role | "ALL" = "ALL"): Promise<TierRow[]> {
  "use cache";
  cacheLife("minutes");
  const [ds, champsByKey] = await Promise.all([loadDataset(), getChampionsByKey()]);
  const rows = computeRoleRows(ds, rank, champsByKey);
  const filtered = role === "ALL" ? rows : rows.filter((r) => r.role === role);
  return filtered.sort((a, b) => b.score - a.score);
}

/* ---------- Campeón ---------- */

export interface ChampionRoleOption {
  role: Role;
  games: number;
  share: number;
}

/** Promedios de la fase de líneas contra un rival directo. */
export interface LaneInfo {
  games: number;
  /** Diferencia de oro al minuto 15 (positivo = a favor). */
  gold15: number;
  /** Asesinatos al rival directo antes del 15, por partida. */
  kills: number;
  /** Muertes contra el rival directo antes del 15, por partida. */
  deaths: number;
}

export interface MatchupStat extends Stat {
  /** Diferencia respecto al winrate general del campeón. */
  delta: number;
  lane: LaneInfo | null;
}

/** Aliado o rival de cualquier línea, con su efecto sobre el winrate. */
export interface PairStat extends Stat {
  role: Role;
  /** Winrate juntos (suavizado) menos el winrate general del campeón. */
  delta: number;
}

export interface ChampionStats {
  role: Role;
  roles: ChampionRoleOption[];
  summary: TierRow | null;
  /** Winrate general del campeón en este rol (base para comparar). */
  baseWinRate: number;
  core: Stat[];
  late: Stat[];
  situational: Stat[];
  boots: Stat[];
  starters: Stat[];
  /** Mejora del objeto de soporte más elegida (solo soportes). */
  supportItems: Stat[];
  runes: Stat[];
  spells: Stat[];
  skills: Stat[];
  /** Rivales de la misma línea. */
  strongAgainst: MatchupStat[];
  weakAgainst: MatchupStat[];
  /** Rivales de otras líneas que más le cuestan / menos le cuestan. */
  enemyThreats: PairStat[];
  enemyEasy: PairStat[];
  /** Compañero de línea inferior (solo tiradores y soportes). */
  bestDuos: PairStat[];
  /** Mejores aliados de cada una de las otras líneas. */
  alliesByRole: Partial<Record<Role, PairStat[]>>;
  /** Aliados con los que más pierde. */
  worstAllies: PairStat[];
}

export async function getChampionStats(championKey: string, rank: RankFilter, preferredRole?: Role): Promise<ChampionStats | null> {
  "use cache";
  cacheLife("minutes");
  const [ds, champsByKey] = await Promise.all([loadDataset(), getChampionsByKey()]);
  const agg = ds.champions[championKey];
  if (!agg) return null;

  const roleTotals = ROLES.filter((r) => agg.roles[r]).map((r) => ({ role: r, games: sumTiers(agg.roles[r]!.byTier, rank).games }));
  const totalGames = roleTotals.reduce((s, r) => s + r.games, 0) || 1;
  const roles = roleTotals
    .map((r) => ({ ...r, share: r.games / totalGames }))
    .filter((r) => r.share >= 0.05)
    .sort((a, b) => b.games - a.games);
  if (!roles.length) return null;

  const role = preferredRole && agg.roles[preferredRole] ? preferredRole : roles[0].role;
  const roleAgg = agg.roles[role] as RoleAgg;
  const roleGames = sumTiers(roleAgg.byTier, "ALL").games;
  const overall = sumTiers(roleAgg.byTier, "ALL");
  const overallWr = overall.games ? overall.wins / overall.games : 0.5;
  const me = `${championKey}:${role}`;
  // Con pocas partidas en el rol los mínimos se adaptan a una fracción de esas partidas (nunca menos de 3);
  // con muestra normal quedan igual que antes.
  const need = (base: number, frac: number) => Math.max(3, Math.min(minSample(ds, base), Math.round(roleGames * frac)));

  const summary = computeRoleRows(ds, rank, champsByKey).find((r) => r.champion.key === championKey && r.role === role) ?? null;

  /* Rivales de la misma línea, con el detalle de la fase de líneas. */
  const laneInfo = (key: string): LaneInfo | null => {
    const d = roleAgg.lane?.[key];
    if (!d || d.games < 3) return null;
    return { games: d.games, gold15: d.gold15 / d.games, kills: d.kills / d.games, deaths: d.deaths / d.games };
  };
  const matchups: MatchupStat[] = Object.entries(roleAgg.matchups)
    .filter(([, c]) => c.games >= Math.max(need(30, 0.03), roleGames * 0.004))
    .map(([key, c]) => ({
      key,
      games: c.games,
      wins: c.wins,
      winRate: c.wins / c.games,
      share: c.games / roleGames,
      delta: shrunkDelta(c, overallWr, 30),
      lane: laneInfo(key),
    }));

  /* Pares (aliados o rivales) que incluyen a este campeón en este rol. */
  const pairsFrom = (map: CountMap | undefined, flipWins: boolean): PairStat[] => {
    if (!map) return [];
    const out: PairStat[] = [];
    for (const [pair, c] of Object.entries(map)) {
      const [a, b] = pair.split("-");
      const other = a === me ? b : b === me ? a : null;
      if (!other || c.games < need(30, 0.04)) continue;
      // En enemies las victorias son del primero de la clave: si este campeón es el segundo, se invierten.
      const wins = flipWins && b === me ? c.games - c.wins : c.wins;
      const [key, otherRole] = other.split(":") as [string, Role];
      const mine = { games: c.games, wins };
      out.push({
        key,
        role: otherRole,
        games: c.games,
        wins,
        winRate: wins / c.games,
        share: c.games / roleGames,
        delta: shrunkDelta(mine, overallWr, 30),
      });
    }
    return out;
  };

  const allies = pairsFrom(ds.teammates, false);
  const enemies = pairsFrom(ds.enemies, true).filter((e) => e.role !== role);

  const alliesByRole: Partial<Record<Role, PairStat[]>> = {};
  for (const r of ROLES) {
    if (r === role) continue;
    const list = allies
      .filter((a) => a.role === r && a.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 4);
    if (list.length) alliesByRole[r] = list;
  }

  // Dúos de línea inferior: usan la tabla de dúos (por rango) en lugar de teammates.
  let bestDuos: PairStat[] = [];
  if (role === "BOTTOM" || role === "UTILITY") {
    const partnerRole: Role = role === "BOTTOM" ? "UTILITY" : "BOTTOM";
    bestDuos = Object.entries(ds.duos)
      .map(([pair, byTier]) => {
        const [adc, sup] = pair.split("-");
        const partner = role === "BOTTOM" ? (adc === championKey ? sup : null) : sup === championKey ? adc : null;
        if (!partner) return null;
        const c = sumTiers(byTier, rank);
        if (c.games < need(40, 0.05)) return null;
        const stat: PairStat = {
          key: partner,
          role: partnerRole,
          games: c.games,
          wins: c.wins,
          winRate: c.wins / c.games,
          share: c.games / roleGames,
          delta: shrunkDelta(c, overallWr, 30),
        };
        return stat;
      })
      .filter((x): x is PairStat => x !== null)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6);
  }

  return {
    role,
    roles,
    summary,
    baseWinRate: overallWr,
    core: coreItems(roleAgg.core, roleGames, 4, need(20, 0.05)),
    // Objetos sueltos (no combinaciones): con la mitad de muestra ya dicen algo.
    late: top(roleAgg.late, roleGames, 8, need(10, 0.03)),
    // Para el set de objetos: más opciones y con menos muestra (son sugerencias, no un ranking).
    situational: top(roleAgg.late, roleGames, 14, minSample(ds, 3)),
    boots: top(roleAgg.boots, roleGames, 3, need(20, 0.05)),
    starters:
      role === "UTILITY"
        ? withSupportItem(top(roleAgg.starters, roleGames, 2, need(20, 0.05)))
        : top(roleAgg.starters, roleGames, 2, need(20, 0.05)),
    supportItems: role === "UTILITY" ? top(roleAgg.support, roleGames, 3, need(10, 0.03)) : [],
    runes: runePages(roleAgg.runes, roleGames, 3, need(20, 0.05)),
    spells: top(roleAgg.spells, roleGames, 3, need(20, 0.05)),
    skills: top(roleAgg.skills, roleGames, 3, need(20, 0.05)),
    // Separados por el 50 %: con pocos rivales registrados no se repiten en ambas listas.
    strongAgainst: matchups
      .filter((m) => m.winRate > 0.5)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 8),
    weakAgainst: matchups
      .filter((m) => m.winRate < 0.5)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 8),
    enemyThreats: enemies
      .filter((e) => e.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 6),
    enemyEasy: enemies
      .filter((e) => e.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6),
    bestDuos,
    alliesByRole,
    worstAllies: allies
      .filter((a) => a.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 5),
  };
}

/* ---------- Sinergias ---------- */

export interface DuoRow {
  adc: string;
  support: string;
  games: number;
  winRate: number;
  pickRate: number;
  /** Ganancia del dúo frente al promedio de ambos campeones por separado. */
  synergy: number;
}

export async function getBotlaneDuos(rank: RankFilter): Promise<DuoRow[]> {
  "use cache";
  cacheLife("minutes");
  const ds = await loadDataset();
  const matches = matchesIn(ds, rank) || 1;
  const soloWr = (key: string, role: Role) => {
    const c = sumTiers(ds.champions[key]?.roles[role]?.byTier, rank);
    return c.games ? c.wins / c.games : 0.5;
  };

  return Object.entries(ds.duos)
    .map(([pair, byTier]) => {
      const [adc, support] = pair.split("-");
      const c = sumTiers(byTier, rank);
      if (c.games < minSample(ds, 60)) return null;
      const winRate = c.wins / c.games;
      const expected = (soloWr(adc, "BOTTOM") + soloWr(support, "UTILITY")) / 2;
      return { adc, support, games: c.games, winRate, pickRate: c.games / matches, synergy: shrunkDelta(c, expected, 100) };
    })
    .filter((x): x is DuoRow => x !== null)
    .sort((a, b) => b.winRate - a.winRate);
}

export interface TeamSynergyRow {
  a: { key: string; role: Role };
  b: { key: string; role: Role };
  games: number;
  winRate: number;
  synergy: number;
}

export async function getTeamSynergies(): Promise<TeamSynergyRow[]> {
  "use cache";
  cacheLife("minutes");
  const ds = await loadDataset();
  const soloWr = (key: string, role: Role) => {
    const c = sumTiers(ds.champions[key]?.roles[role]?.byTier, "ALL");
    return c.games ? c.wins / c.games : 0.5;
  };
  return Object.entries(ds.teammates)
    .map(([pair, c]) => {
      if (c.games < minSample(ds, 80)) return null;
      const [left, right] = pair.split("-");
      const [ka, ra] = left.split(":") as [string, Role];
      const [kb, rb] = right.split(":") as [string, Role];
      const winRate = c.wins / c.games;
      const expected = (soloWr(ka, ra) + soloWr(kb, rb)) / 2;
      return { a: { key: ka, role: ra }, b: { key: kb, role: rb }, games: c.games, winRate, synergy: shrunkDelta(c, expected, 100) };
    })
    .filter((x): x is TeamSynergyRow => x !== null)
    .sort((a, b) => b.synergy - a.synergy);
}

/* ---------- Selección de campeones en vivo ---------- */

export interface DraftSlot {
  key: string;
  /** Rol conocido (el cliente lo informa en clasificatorias); null = se estima. */
  role: Role | null;
}

export interface DraftChampion {
  key: string;
  role: Role;
  /** true cuando el rol se estimó a partir de dónde se juega más el campeón. */
  guessed: boolean;
  tier: TierRow | null;
}

export interface DraftRelation {
  key: string;
  role: Role;
  games: number;
  /** Winrate del campeón propio en esa situación. */
  winRate: number;
  /** Diferencia frente al winrate general del campeón propio. */
  delta: number;
  lane: LaneInfo | null;
}

export interface DraftInsights {
  allies: DraftChampion[];
  enemies: DraftChampion[];
  /** Rival directo de línea, si se pudo identificar. */
  laneOpponent: DraftRelation | null;
  /** Efecto de cada rival (otras líneas) sobre el campeón propio. */
  versus: DraftRelation[];
  /** Sinergia con cada aliado. */
  synergy: DraftRelation[];
  /** Campeones del rol propio que mejor le van al rival de línea (para elegir). */
  answers: DraftRelation[];
  /** Una fila por rol: sinergia con el aliado y enfrentamiento con el rival de ese rol. */
  encounters: Encounter[];
  /** Winrate general del campeón propio en su rol. */
  baseWinRate: number;
  /** Winrate esperado sumando el efecto de los campeones ya elegidos. */
  estimatedWinRate: number | null;
  /** Cada línea: cómo le va al aliado contra el rival de esa misma línea. */
  lanes: LaneMatchup[];
  /** Ventaja de cada equipo según cuánto dure la partida. */
  scaling: ScalingRow[];
}

export interface LaneMatchup {
  role: Role;
  ally: string | null;
  enemy: string | null;
  /** Winrate del aliado contra ese rival (ajustado por muestra); null sin datos. */
  allyWinRate: number | null;
  games: number;
}

export interface ScalingRow {
  phase: GameLength;
  /** Promedio de lo que cada campeón gana o pierde en partidas de esa duración frente a su winrate general. */
  ally: number;
  enemy: number;
  /** Partidas con duración registrada detrás del cálculo (las más chicas de ambos equipos). */
  games: number;
}

/** Celda de la tabla de encuentros. Sin campeón (a ciegas) usa el promedio contra todo ese rol. */
export interface EncounterCell {
  key: string | null;
  games: number;
  /** Ajustado por tamaño de muestra. */
  winRate: number;
  delta: number;
  blind: boolean;
  /** El rol de ese campeón se estimó (el cliente no lo informa). */
  guessed: boolean;
}

export interface Encounter {
  role: Role;
  /** null en la fila del propio rol (no hay aliado ahí). */
  ally: EncounterCell | null;
  enemy: EncounterCell;
}

/** Totales del campeón propio con aliados y contra rivales de cada rol (para los casos a ciegas). */
async function getBlindAverages(
  key: string,
  role: Role,
): Promise<{ ally: Partial<Record<Role, Counts>>; enemy: Partial<Record<Role, Counts>> }> {
  "use cache";
  cacheLife("minutes");
  const ds = await loadDataset();
  const meId = `${key}:${role}`;
  const add = (target: Partial<Record<Role, Counts>>, r: Role, games: number, wins: number) => {
    const c = (target[r] ??= { games: 0, wins: 0 });
    c.games += games;
    c.wins += wins;
  };
  const scan = (map: CountMap | undefined, target: Partial<Record<Role, Counts>>, flip: boolean) => {
    for (const [pair, c] of Object.entries(map ?? {})) {
      const [a, b] = pair.split("-");
      const other = a === meId ? b : b === meId ? a : null;
      if (!other) continue;
      add(target, other.split(":")[1] as Role, c.games, flip && b === meId ? c.games - c.wins : c.wins);
    }
  };
  const ally: Partial<Record<Role, Counts>> = {};
  const enemy: Partial<Record<Role, Counts>> = {};
  scan(ds.teammates, ally, false);
  scan(ds.enemies, enemy, true);
  // Contra el rival de la misma línea: todos sus enfrentamientos.
  for (const c of Object.values(ds.champions[key]?.roles[role]?.matchups ?? {})) add(enemy, role, c.games, c.wins);
  return { ally, enemy };
}

/** Reparte roles a los campeones sin rol conocido según dónde más se juegan. */
function assignRoles(ds: MetaDataset, slots: DraftSlot[]): { key: string; role: Role; guessed: boolean }[] {
  const share = (key: string, role: Role) => {
    const roles = ds.champions[key]?.roles ?? {};
    const total = ROLES.reduce((s, r) => s + sumTiers(roles[r]?.byTier, "ALL").games, 0);
    return total ? sumTiers(roles[role]?.byTier, "ALL").games / total : 0.2;
  };
  const taken = new Set(slots.map((s) => s.role).filter((r): r is Role => r !== null));
  const open = ROLES.filter((r) => !taken.has(r));
  const unknown = slots.filter((s) => s.role === null);

  // Con 5 campeones como máximo se prueban todas las combinaciones (≤ 120).
  let best: Role[] = [];
  let bestScore = -Infinity;
  const walk = (i: number, used: Role[], score: number) => {
    if (i === unknown.length) {
      if (score > bestScore) [best, bestScore] = [used, score];
      return;
    }
    const pool = open.filter((r) => !used.includes(r));
    // Más campeones que roles libres (no debería pasar): se repite el más probable.
    const options = pool.length ? pool : ROLES;
    for (const r of options) walk(i + 1, [...used, r], score + Math.log(share(unknown[i].key, r) + 0.01));
  };
  walk(0, [], 0);

  let u = 0;
  return slots.map((s) => (s.role ? { key: s.key, role: s.role, guessed: false } : { key: s.key, role: best[u++], guessed: true }));
}

/**
 * `me.key` puede faltar (todavía no elige): igual se reparten los roles y se
 * sugieren respuestas al rival de línea si el rol propio se conoce.
 */
export async function getDraftInsights(
  me: { key: string | null; role: Role | null },
  allies: DraftSlot[],
  enemies: DraftSlot[],
  rank: RankFilter,
): Promise<DraftInsights> {
  "use cache";
  cacheLife("minutes");
  const [ds, champsByKey] = await Promise.all([loadDataset(), getChampionsByKey()]);
  const rows = computeRoleRows(ds, rank, champsByKey);
  const tierOf = (key: string, role: Role) => rows.find((r) => r.champion.key === key && r.role === role) ?? null;

  // Un rol propio conocido queda reservado aunque todavía no haya campeón.
  const reserved = !me.key && me.role ? [{ key: "", role: me.role }] : [];
  const myTeam = assignRoles(ds, me.key ? [{ key: me.key, role: me.role }, ...allies] : [...reserved, ...allies]);
  const theirTeam = assignRoles(ds, enemies);
  const self = me.key ? myTeam[0] : null;
  const myRole = self?.role ?? me.role;
  const toDraft = (c: { key: string; role: Role; guessed: boolean }): DraftChampion => ({ ...c, tier: tierOf(c.key, c.role) });
  const opp = myRole ? (theirTeam.find((e) => e.role === myRole) ?? null) : null;

  // Respuestas al rival de línea: sus enfrentamientos, vistos desde el otro lado.
  let answers: DraftRelation[] = [];
  const oppAgg = opp ? ds.champions[opp.key]?.roles[opp.role] : undefined;
  if (opp && oppAgg) {
    const oppOverall = sumTiers(oppAgg.byTier, "ALL");
    const oppBase = oppOverall.games ? 1 - oppOverall.wins / oppOverall.games : 0.5;
    answers = Object.entries(oppAgg.matchups)
      .filter(([key, c]) => c.games >= minSample(ds, 30) && champsByKey[key])
      .map(([key, c]) => {
        const mine = { games: c.games, wins: c.games - c.wins };
        return { key, role: opp.role, games: c.games, winRate: mine.wins / mine.games, delta: shrunkDelta(mine, oppBase, 30), lane: null };
      })
      .filter((a) => a.winRate > 0.5)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6);
  }

  const allyChamps = me.key ? myTeam : myTeam.slice(reserved.length);
  const lanes: LaneMatchup[] = ROLES.map((r) => {
    const a = allyChamps.find((c) => c.role === r && c.key);
    const e = theirTeam.find((c) => c.role === r);
    const agg = a ? ds.champions[a.key]?.roles[r] : undefined;
    const c = e ? agg?.matchups[e.key] : undefined;
    const all = sumTiers(agg?.byTier, "ALL");
    const aBase = all.games ? all.wins / all.games : 0.5;
    return {
      role: r,
      ally: a?.key ?? null,
      enemy: e?.key ?? null,
      allyWinRate: c && c.games ? aBase + shrunkDelta(c, aBase, 30) : null,
      games: c?.games ?? 0,
    };
  });

  // Escalado: qué tanto rinde cada campeón en partidas cortas, medias y largas frente a su winrate general.
  const lengthEffect = (team: { key: string; role: Role }[], phase: GameLength) => {
    let sum = 0;
    let n = 0;
    let games = Infinity;
    for (const t of team) {
      const agg = ds.champions[t.key]?.roles[t.role];
      const c = agg?.byLength?.[phase];
      if (!agg || !c?.games) continue;
      const all = sumTiers(agg.byTier, "ALL");
      sum += shrunkDelta(c, all.games ? all.wins / all.games : 0.5, 40);
      n++;
      games = Math.min(games, c.games);
    }
    return { value: n ? sum / n : 0, n, games: n ? games : 0 };
  };
  const scaling: ScalingRow[] = [];
  for (const phase of ["early", "mid", "late"] as const) {
    const a = lengthEffect(
      allyChamps.filter((c) => c.key),
      phase,
    );
    const e = lengthEffect(theirTeam, phase);
    if (a.n && e.n) scaling.push({ phase, ally: a.value, enemy: e.value, games: Math.min(a.games, e.games) });
  }

  const empty: DraftInsights = {
    allies: myTeam.slice(me.key || reserved.length ? 1 : 0).map(toDraft),
    enemies: theirTeam.map(toDraft),
    laneOpponent: null,
    versus: [],
    synergy: [],
    answers,
    encounters: [],
    baseWinRate: 0.5,
    estimatedWinRate: null,
    lanes,
    scaling,
  };
  if (!self) return empty;

  const roleAgg = ds.champions[self.key]?.roles[self.role];
  const overall = sumTiers(roleAgg?.byTier, "ALL");
  const base = overall.games ? overall.wins / overall.games : 0.5;
  const meId = `${self.key}:${self.role}`;

  const relation = (key: string, role: Role, c: Counts | undefined, lane: LaneInfo | null = null): DraftRelation | null =>
    c && c.games > 0 ? { key, role, games: c.games, winRate: c.wins / c.games, delta: shrunkDelta(c, base, 30), lane } : null;

  let laneOpponent: DraftRelation | null = null;
  if (opp) {
    const d = roleAgg?.lane?.[opp.key];
    const lane =
      d && d.games >= 3 ? { games: d.games, gold15: d.gold15 / d.games, kills: d.kills / d.games, deaths: d.deaths / d.games } : null;
    laneOpponent = relation(opp.key, opp.role, roleAgg?.matchups[opp.key], lane) ?? {
      key: opp.key,
      role: opp.role,
      games: 0,
      winRate: base,
      delta: 0,
      lane,
    };
  }

  const versus = theirTeam
    .filter((e) => e !== opp)
    .map((e) => {
      const key = pairKey(self.key, self.role, e.key, e.role);
      const c = ds.enemies?.[key];
      // En enemies las victorias son del primero de la clave.
      const mine = c && !key.startsWith(meId) ? { games: c.games, wins: c.games - c.wins } : c;
      return relation(e.key, e.role, mine);
    })
    .filter((x): x is DraftRelation => x !== null);

  const synergy = myTeam
    .slice(1)
    .map((a) => {
      if (self.role === "BOTTOM" && a.role === "UTILITY") return relation(a.key, a.role, sumTiers(ds.duos[`${self.key}-${a.key}`], rank));
      if (self.role === "UTILITY" && a.role === "BOTTOM") return relation(a.key, a.role, sumTiers(ds.duos[`${a.key}-${self.key}`], rank));
      return relation(a.key, a.role, ds.teammates[pairKey(self.key, self.role, a.key, a.role)]);
    })
    .filter((x): x is DraftRelation => x !== null);

  /* Tabla de encuentros: un rol por fila; sin campeón elegido se usa el promedio de ese rol. */
  const blind = await getBlindAverages(self.key, self.role);
  const blindCell = (c: Counts | undefined): EncounterCell =>
    c && c.games > 0
      ? {
          key: null,
          games: c.games,
          winRate: base + shrunkDelta(c, base, 30),
          delta: shrunkDelta(c, base, 30),
          blind: true,
          guessed: false,
        }
      : { key: null, games: 0, winRate: base, delta: 0, blind: true, guessed: false };
  const knownCell = (champ: { key: string; guessed: boolean }, rel: DraftRelation | undefined | null): EncounterCell => ({
    key: champ.key,
    games: rel?.games ?? 0,
    // Winrate ajustado por muestra (base + diferencia encogida): con pocas partidas no muestra extremos.
    winRate: base + (rel?.delta ?? 0),
    delta: rel?.delta ?? 0,
    blind: false,
    guessed: champ.guessed,
  });
  const encounters: Encounter[] = ROLES.map((r) => {
    const ally = myTeam.slice(1).find((a) => a.role === r);
    const enemy = theirTeam.find((e) => e.role === r);
    return {
      role: r,
      ally:
        r === self.role
          ? null
          : ally
            ? knownCell(
                ally,
                synergy.find((s) => s.key === ally.key),
              )
            : blindCell(blind.ally[r]),
      enemy: enemy ? knownCell(enemy, r === self.role ? laneOpponent : versus.find((v) => v.key === enemy.key)) : blindCell(blind.enemy[r]),
    };
  });

  // Efecto de lo ya elegido (las celdas a ciegas no suman: son el promedio).
  const known = encounters.flatMap((e) => [e.ally, e.enemy]).filter((c): c is EncounterCell => c !== null && !c.blind);
  const estimatedWinRate = Math.min(0.7, Math.max(0.3, base + known.reduce((s, c) => s + c.delta, 0)));

  return { ...empty, laneOpponent, versus, synergy, encounters, baseWinRate: base, estimatedWinRate };
}

/* ---------- Mejores picks según el draft ---------- */

export interface DraftPickReason {
  text: string;
  /** Efecto en el winrate (positivo = a favor). */
  delta: number;
}

export interface DraftPick {
  key: string;
  role: Role;
  tier: TierRow;
  /** Winrate esperado: el del campeón más el efecto de los campeones ya elegidos. */
  winRate: number;
  /** Los dos efectos más fuertes (a favor o en contra), para explicar la recomendación. */
  reasons: DraftPickReason[];
}

/**
 * Candidatos para tu línea ordenados por cómo encajan en el draft: su winrate
 * en el rol más lo que ganan o pierden contra cada rival elegido (el de la
 * línea pesa completo, los demás a la mitad) y con cada aliado (a la mitad).
 * Deja afuera a los campeones elegidos o bloqueados.
 */
export async function getDraftPicks(
  role: Role,
  allies: DraftSlot[],
  enemies: DraftSlot[],
  unavailable: string[],
  rank: RankFilter,
  limit = 6,
): Promise<DraftPick[]> {
  "use cache";
  cacheLife("minutes");
  const [ds, champsByKey] = await Promise.all([loadDataset(), getChampionsByKey()]);
  const rows = computeRoleRows(ds, rank, champsByKey);
  const myTeam = assignRoles(ds, [{ key: "", role }, ...allies]).slice(1);
  const theirTeam = assignRoles(ds, enemies);
  const taken = new Set([...unavailable, ...allies.map((a) => a.key), ...enemies.map((e) => e.key)]);
  const name = (key: string) => champsByKey[key]?.name ?? key;

  const candidates = rows
    .filter((r) => r.role === role && !taken.has(r.champion.key))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  const picks = candidates.map((row): DraftPick => {
    const key = row.champion.key;
    const roleAgg = ds.champions[key]?.roles[role];
    const all = sumTiers(roleAgg?.byTier, "ALL");
    const base = all.games ? all.wins / all.games : 0.5;
    const meId = `${key}:${role}`;
    const effects: DraftPickReason[] = [];
    let total = 0;

    for (const e of theirTeam) {
      if (e.role === role) {
        const c = roleAgg?.matchups[e.key];
        if (!c?.games) continue;
        const d = shrunkDelta(c, base, 30);
        total += d;
        effects.push({ text: d >= 0 ? `Le gana a ${name(e.key)} en línea` : `Sufre contra ${name(e.key)} en línea`, delta: d });
      } else {
        const pk = pairKey(key, role, e.key, e.role);
        const c = ds.enemies?.[pk];
        if (!c?.games) continue;
        // En enemies las victorias son del primero de la clave.
        const mine = pk.startsWith(meId) ? c : { games: c.games, wins: c.games - c.wins };
        const d = shrunkDelta(mine, base, 30) / 2;
        total += d;
        effects.push({ text: d >= 0 ? `Le va bien contra ${name(e.key)}` : `Le cuesta ${name(e.key)}`, delta: d });
      }
    }
    for (const a of myTeam) {
      const c =
        role === "BOTTOM" && a.role === "UTILITY"
          ? sumTiers(ds.duos[`${key}-${a.key}`], rank)
          : role === "UTILITY" && a.role === "BOTTOM"
            ? sumTiers(ds.duos[`${a.key}-${key}`], rank)
            : ds.teammates[pairKey(key, role, a.key, a.role)];
      if (!c?.games) continue;
      const d = shrunkDelta(c, base, 30) / 2;
      total += d;
      effects.push({ text: d >= 0 ? `Buena pareja con ${name(a.key)}` : `No combina con ${name(a.key)}`, delta: d });
    }

    // El winrate del rol también se encoge: un campeón con pocas partidas no queda primero por suerte.
    const winRate = Math.min(0.7, Math.max(0.3, 0.5 + shrunkDelta(all, 0.5, 150) + total));
    const reasons = effects
      .filter((e) => Math.abs(e.delta) >= 0.005)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 2);
    return { key, role, tier: row, winRate, reasons };
  });

  return picks.sort((a, b) => b.winRate - a.winRate).slice(0, limit);
}

/* ---------- Objeto de soporte ---------- */

/** Mapamundi: el objeto inicial de soporte. */
export const SUPPORT_STARTER = "3865";

/**
 * El objeto de soporte ahora se entrega gratis al empezar y no aparece como compra en
 * la línea de tiempo: la compra inicial de los soportes quedaba solo con pociones.
 */
function withSupportItem(rows: Stat[]): Stat[] {
  return rows.map((s) =>
    s.key.split("-").some((id) => Number(id) >= 3860 && Number(id) <= 3877) ? s : { ...s, key: `${SUPPORT_STARTER}-${s.key}` },
  );
}

/* ---------- Build según el rival directo ---------- */

export interface MatchupItem {
  id: string;
  games: number;
  winRate: number;
  /** Porcentaje de partidas contra este rival en que se compró (entre los primeros 4 objetos). */
  share: number;
  /** Diferencia con lo que se compra contra cualquier rival (positivo = se compra más contra este). */
  lift: number;
}

export interface MatchupBuildInfo {
  opponent: string;
  games: number;
  winRate: number;
  items: MatchupItem[];
  /** Objetos que se compran claramente más contra este rival que en general. */
  risers: MatchupItem[];
  keystone: { id: string; share: number; winRate: number } | null;
}

/** Rivales directos con datos de build, de más a menos partidas. */
export async function getMatchupOpponents(championKey: string, role: Role, min = 5): Promise<{ key: string; games: number }[]> {
  "use cache";
  cacheLife("minutes");
  const ds = await loadDataset();
  const vs = ds.champions[championKey]?.roles[role]?.vs ?? {};
  return Object.entries(vs)
    .filter(([, v]) => v.games >= min)
    .map(([key, v]) => ({ key, games: v.games }))
    .sort((a, b) => b.games - a.games);
}

export async function getMatchupBuild(championKey: string, role: Role, opponentKey: string, min = 5): Promise<MatchupBuildInfo | null> {
  "use cache";
  cacheLife("minutes");
  const ds = await loadDataset();
  const all = ds.champions[championKey]?.roles[role]?.vs;
  const vs = all?.[opponentKey];
  if (!all || !vs || vs.games < min) return null;

  // Frecuencia general de cada objeto (contra cualquier rival) para saber qué cambia contra este.
  let totalGames = 0;
  const general = new Map<string, number>();
  for (const v of Object.values(all)) {
    totalGames += v.games;
    for (const [id, c] of Object.entries(v.items)) general.set(id, (general.get(id) ?? 0) + c.games);
  }

  const items: MatchupItem[] = Object.entries(vs.items)
    .map(([id, c]) => {
      const share = c.games / vs.games;
      return { id, games: c.games, winRate: c.wins / c.games, share, lift: share - (general.get(id) ?? 0) / Math.max(1, totalGames) };
    })
    .filter((i) => i.games >= 2)
    .sort((a, b) => b.games - a.games);
  // Con pocas partidas cualquier diferencia parece un cambio: los ajustes recién se muestran desde 10.
  const risers = vs.games >= 10 ? items.filter((i) => i.lift >= 0.08 && i.games >= 3).sort((a, b) => b.lift - a.lift) : [];
  const [ksId, ks] = Object.entries(vs.keystones).sort((a, b) => b[1].games - a[1].games)[0] ?? [];

  return {
    opponent: opponentKey,
    games: vs.games,
    winRate: vs.wins / vs.games,
    items: items.slice(0, 8),
    risers: risers.slice(0, 4),
    keystone: ksId && ks ? { id: ksId, share: ks.games / vs.games, winRate: ks.wins / ks.games } : null,
  };
}
