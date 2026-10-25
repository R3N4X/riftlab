/**
 * Comps, unidades y objetos del meta calculados sobre data/tft-meta.json.
 * Todo se ordena por colocación promedio (más baja = mejor), suavizada para
 * que una comp con 5 partidas y suerte no quede primera.
 */
import { cacheLife } from "next/cache";
import { avgPlace, getTftCatalog, getTftDataset, shrunkPlace, top4Rate, winRate, type TftCatalog } from "./data";
import type { TftStat } from "./types";

export type CompGrade = "S" | "A" | "B" | "C";

export interface CompUnit {
  id: string;
  /** Fracción de los tableros de la comp en que aparece. */
  freq: number;
  stars: number;
  /** Objetos más usados en esta comp (solo si la unidad suele llevarlos). */
  items: string[];
}

/** Cómo se juega: a qué nivel se busca el tablero y si se rerollea. */
export interface CompStyle {
  kind: "reroll" | "fast9" | "level8" | "level7";
  /** Nivel en el que se gasta el oro buscando las unidades. */
  level: number;
  label: string;
  /** Una o dos frases para el detalle. */
  howTo: string;
}

export interface CompDifficulty {
  level: "Fácil" | "Media" | "Difícil";
  /** Qué la hace más o menos difícil (se muestra al pasar el mouse). */
  reasons: string[];
}

export interface CompView {
  key: string;
  name: string;
  carry: string;
  trait: string;
  grade: CompGrade;
  games: number;
  playRate: number;
  avgPlace: number;
  top4: number;
  win: number;
  level: number;
  /** Tablero final típico: las unidades presentes en al menos la mitad de las partidas. */
  core: CompUnit[];
  /** Alternativas que aparecen seguido sin ser fijas. */
  flex: CompUnit[];
  traits: { id: string; style: number; freq: number }[];
  style: CompStyle;
  difficulty: CompDifficulty;
}

export interface TftMeta {
  set: number;
  patch: string;
  generatedAt: string;
  matches: number;
  boards: number;
  platforms: string[];
  comps: CompView[];
}

const isEmblem = (item: string) => /Emblem/i.test(item);

/** Las mejores ~15 % son S, el siguiente 25 % A, luego 35 % B y el resto C. */
function gradeFor(rank: number, total: number): CompGrade {
  const q = rank / Math.max(1, total);
  return q < 0.15 ? "S" : q < 0.4 ? "A" : q < 0.75 ? "B" : "C";
}

/**
 * Estilo de juego a partir de lo que hicieron los jugadores: si el carry es
 * barato y termina con 3 estrellas es reroll; si no, el nivel final promedio
 * dice hasta dónde suben.
 */
function compStyle(carryName: string, carryCost: number, carryStars: number, level: number): CompStyle {
  if (carryCost <= 3 && carryStars >= 2.5) {
    const at = carryCost === 1 ? 6 : 7;
    return {
      kind: "reroll",
      level: at,
      label: `Reroll al ${at}`,
      howTo: `Quédate en nivel ${at} y gasta el oro en la tienda hasta tener a ${carryName} con 3 estrellas; después sube para completar el tablero.`,
    };
  }
  // En Maestro+ casi todos llegan a 8; un promedio cerca de 9 indica que la comp se completa ahí.
  if (level >= 8.75 || carryCost === 5) {
    return {
      kind: "fast9",
      level: 9,
      label: "Subir rápido al 9",
      howTo: `Juega con la economía y sube de nivel en vez de gastar en la tienda: ${carryName} y las piezas clave son de 4 y 5 de oro y aparecen en nivel 9.`,
    };
  }
  if (level >= 7.8) {
    return {
      kind: "level8",
      level: 8,
      label: "Subir al 8",
      howTo: `Estabilízate con lo que salga y sube al 8 para buscar a ${carryName} y las unidades de 4 de oro.`,
    };
  }
  return {
    kind: "level7",
    level: 7,
    label: "Jugar al 7",
    howTo: `Arma el tablero en nivel 7 y busca ahí a ${carryName}; no hace falta subir más para que funcione.`,
  };
}

/** Puntaje simple y explicable: subir alto, muchas unidades caras y tableros cambiantes la hacen más difícil. */
function compDifficulty(style: CompStyle, expensive: number, flexCount: number): CompDifficulty {
  const reasons: string[] = [];
  let score = 0;
  if (style.kind === "fast9") {
    score += 1.5;
    reasons.push("Hay que manejar bien la economía para llegar a nivel 9");
  } else if (style.kind === "level8") {
    score += 0.75;
    reasons.push("Pide llegar a nivel 8 con vida suficiente");
  } else if (style.kind === "reroll") {
    score += 0.25;
    reasons.push("Se arma pronto con unidades baratas");
  } else {
    score += 0.5;
    reasons.push("Funciona en nivel 7, sin subir mucho");
  }
  if (expensive > 2) {
    score += Math.min(1, (expensive - 2) * 0.25);
    reasons.push(`${expensive} unidades de 4 o 5 de oro en el tablero final`);
  }
  if (flexCount >= 4) {
    score += 0.5;
    reasons.push("Muchas piezas que cambian según lo que salga");
  }
  return { level: score <= 1 ? "Fácil" : score <= 2 ? "Media" : "Difícil", reasons };
}

function compName(catalog: TftCatalog, carry: string, trait: string): string {
  const unit = catalog.units[carry]?.name ?? carry;
  const t = catalog.traits[trait]?.name;
  return t ? `${t} con ${unit}` : unit;
}

export async function getTftMeta(): Promise<TftMeta | null> {
  "use cache";
  cacheLife("minutes");
  const ds = await getTftDataset();
  if (!ds) return null;
  const catalog = await getTftCatalog(ds.set);

  // Con pocas partidas se baja el mínimo para no dejar la página vacía.
  const minGames = Math.max(10, Math.round(ds.boards * 0.005));
  const qualified = Object.entries(ds.comps).filter(([, c]) => c.stat.games >= minGames && catalog.units[c.carry]);
  qualified.sort(([, a], [, b]) => shrunkPlace(a.stat, 30) - shrunkPlace(b.stat, 30));

  const comps = qualified.map(([key, c], rank): CompView => {
    const units = Object.entries(c.units)
      .filter(([id]) => catalog.units[id])
      .map(([id, u]): CompUnit => {
        const itemTotal = Object.values(u.items).reduce((a, b) => a + b, 0);
        const items =
          itemTotal / u.games >= 1
            ? Object.entries(u.items)
                .filter(([item]) => !isEmblem(item) && catalog.items[item])
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([item]) => item)
            : [];
        return { id, freq: u.games / c.stat.games, stars: u.starSum / u.games, items };
      });
    const byCost = (a: CompUnit, b: CompUnit) => (catalog.units[a.id]?.cost ?? 0) - (catalog.units[b.id]?.cost ?? 0) || b.freq - a.freq;
    const traits = Object.entries(c.traits)
      .map(([k, n]) => {
        const [id, style] = k.split(":");
        return { id, style: Number(style), freq: n / c.stat.games };
      })
      .filter((t) => t.freq >= 0.35 && catalog.traits[t.id]);
    // Un rasgo puede aparecer en varios niveles: se deja el más común.
    const bestTrait = new Map<string, { id: string; style: number; freq: number }>();
    for (const t of traits) if ((bestTrait.get(t.id)?.freq ?? 0) < t.freq) bestTrait.set(t.id, t);

    const core = units.filter((u) => u.freq >= 0.5).sort(byCost);
    const flex = units
      .filter((u) => u.freq >= 0.2 && u.freq < 0.5)
      .sort((a, b) => b.freq - a.freq)
      .slice(0, 5);
    const carryUnit = catalog.units[c.carry];
    const carryStars = units.find((u) => u.id === c.carry)?.stars ?? 1;
    const level = c.levelSum / c.stat.games;
    const style = compStyle(carryUnit?.name ?? c.carry, carryUnit?.cost ?? 4, carryStars, level);
    const expensive = core.filter((u) => (catalog.units[u.id]?.cost ?? 0) >= 4).length;

    return {
      key,
      name: compName(catalog, c.carry, c.trait),
      carry: c.carry,
      trait: c.trait,
      grade: gradeFor(rank, qualified.length),
      games: c.stat.games,
      playRate: c.stat.games / ds.boards,
      avgPlace: avgPlace(c.stat),
      top4: top4Rate(c.stat),
      win: winRate(c.stat),
      level,
      core,
      flex,
      traits: [...bestTrait.values()].sort((a, b) => b.style - a.style || b.freq - a.freq),
      style,
      difficulty: compDifficulty(style, expensive, flex.length),
    };
  });

  return {
    set: ds.set,
    patch: ds.patch,
    generatedAt: ds.generatedAt,
    matches: ds.matches,
    boards: ds.boards,
    platforms: ds.platforms,
    comps,
  };
}

export interface UnitStatView {
  id: string;
  games: number;
  playRate: number;
  avgPlace: number;
  top4: number;
  /** Objetos más armados en la unidad, con su resultado. */
  items: { id: string; games: number; avgPlace: number }[];
}

export async function getTftUnitStats(): Promise<Record<string, UnitStatView>> {
  "use cache";
  cacheLife("minutes");
  const ds = await getTftDataset();
  if (!ds) return {};
  const out: Record<string, UnitStatView> = {};
  for (const [id, u] of Object.entries(ds.units)) {
    const minItemGames = Math.max(4, Math.round(u.stat.games * 0.03));
    out[id] = {
      id,
      games: u.stat.games,
      playRate: u.stat.games / ds.boards,
      avgPlace: avgPlace(u.stat),
      top4: top4Rate(u.stat),
      items: Object.entries(u.items)
        .filter(([item, s]) => s.games >= minItemGames && !isEmblem(item))
        .sort((a, b) => b[1].games - a[1].games)
        .slice(0, 6)
        .map(([item, s]) => ({ id: item, games: s.games, avgPlace: avgPlace(s) })),
    };
  }
  return out;
}

export async function getTftItemStats(): Promise<Record<string, TftStat>> {
  "use cache";
  cacheLife("minutes");
  return (await getTftDataset())?.items ?? {};
}
