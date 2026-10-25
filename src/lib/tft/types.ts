/**
 * Formato de data/tft-meta.json (lo genera `npm run aggregate:tft`). Guarda
 * conteos crudos para poder seguir sumando partidas; los porcentajes y la
 * nota de cada comp se calculan al leerlo.
 */

/** Resultados de un grupo de tableros: la colocación va de 1 a 8. */
export interface TftStat {
  games: number;
  placeSum: number;
  top4: number;
  wins: number;
}

export interface TftCompUnitAgg {
  /** Tableros de la comp en los que aparece. */
  games: number;
  starSum: number;
  /** Veces que llevó cada objeto. */
  items: Record<string, number>;
}

export interface TftCompAgg {
  /** Unidad que lleva más objetos (la que se arma). */
  carry: string;
  /** Rasgo principal activo (sin contar los rasgos únicos de una sola unidad). */
  trait: string;
  stat: TftStat;
  levelSum: number;
  units: Record<string, TftCompUnitAgg>;
  /** Veces que quedó activo cada rasgo, por "rasgo:estilo" (1 bronce … 4 prismático). */
  traits: Record<string, number>;
}

export interface TftUnitAgg {
  stat: TftStat;
  /** Resultado de la unidad cuando lleva cada objeto. */
  items: Record<string, TftStat>;
}

export interface TftDataset {
  version: 1;
  /** Número del set (tft_set_number de la API). */
  set: number;
  /** Parche de Data Dragon cuando se juntaron las partidas. */
  patch: string;
  generatedAt: string;
  platforms: string[];
  matches: number;
  boards: number;
  comps: Record<string, TftCompAgg>;
  units: Record<string, TftUnitAgg>;
  items: Record<string, TftStat>;
  /** Por "rasgo:estilo". */
  traits: Record<string, TftStat>;
}
