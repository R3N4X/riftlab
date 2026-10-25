import type { Role, Tier } from "../constants";

/**
 * Formato del dataset agregado. Lo genera `scripts/aggregate.ts` a partir de
 * partidas reales (API de Riot) o `demo.ts` cuando todavía no hay datos.
 * Todo son conteos crudos; los porcentajes se calculan al leer.
 */
export interface Counts {
  games: number;
  wins: number;
}

export type CountMap = Record<string, Counts>;

/** Sumas de la fase de líneas contra un rival directo (solo partidas con timeline). */
export interface LaneDetail {
  /** Partidas con línea de tiempo (divisor para los promedios). */
  games: number;
  /** Suma de la diferencia de oro al minuto 15 (propio - rival). */
  gold15: number;
  /** Veces que mató al rival directo antes del minuto 15. */
  kills: number;
  /** Veces que el rival directo lo mató antes del minuto 15. */
  deaths: number;
}
export type TierCounts = Partial<Record<Tier, Counts>>;

/** Lo que se compra y usa contra un rival directo concreto (todas las divisiones juntas). */
export interface MatchupBuild {
  games: number;
  wins: number;
  /** Primeros 4 objetos completos, contados por separado. */
  items: CountMap;
  /** Runa clave. */
  keystones: CountMap;
}

export interface RoleAgg {
  byTier: TierCounts;
  /** Primeros 3 objetos completos en orden de compra: "3078-6333-3053". */
  core: CountMap;
  /** Objetos completos comprados como 4.º, 5.º o 6.º objeto. */
  late: CountMap;
  /** Botas de nivel 2. */
  boots: CountMap;
  /** Compra inicial: "1055-2003". */
  starters: CountMap;
  /** "8000:8010,9111,9104,8299|8400:8444,8451|5008,5008,5001". */
  runes: CountMap;
  /** Hechizos de invocador ordenados por id: "4-12". */
  spells: CountMap;
  /** Secuencia de los primeros 15 niveles de habilidad: "QEWQQRQEQEREEWW". */
  skills: CountMap;
  /** Rival directo en la misma línea, por key de campeón. */
  matchups: CountMap;
  /** Detalle de la fase de líneas contra cada rival directo (sumas). */
  lane?: Record<string, LaneDetail>;
  /** Resultados según la duración de la partida (menos de 26 min, 26-32, 33 o más). */
  byLength?: Partial<Record<GameLength, Counts>>;
  /** Mejora final del objeto de soporte (solo soportes; datasets desde el 25-10-2026). */
  support?: CountMap;
  /** Build contra cada rival directo, por key de campeón (datasets desde el 25-10-2026). */
  vs?: Record<string, MatchupBuild>;
}

export type GameLength = "early" | "mid" | "late";

export interface ChampionAgg {
  /** Partidas en que el campeón fue bloqueado, por división. */
  bans: Partial<Record<Tier, number>>;
  roles: Partial<Record<Role, RoleAgg>>;
}

export interface MetaDataset {
  version: 1;
  source: "riot" | "demo";
  /** Parche comercial, p. ej. "26.21". */
  patch: string;
  generatedAt: string;
  platforms: string[];
  /** Partidas analizadas por división. */
  matches: Partial<Record<Tier, number>>;
  /** Por key numérica de campeón. */
  champions: Record<string, ChampionAgg>;
  /** Dúos de línea inferior "tiradorKey-soporteKey", por división. */
  duos: Record<string, TierCounts>;
  /** Pares de aliados "keyA:ROL-keyB:ROL" (orden alfabético), muestra completa. */
  teammates: CountMap;
  /**
   * Rivales de cualquier línea, misma clave que teammates ("keyA:ROL-keyB:ROL"
   * en orden alfabético). Las victorias son las del PRIMERO de la clave.
   * Opcional: los datasets anteriores a este campo no lo traen.
   */
  enemies?: CountMap;
}
