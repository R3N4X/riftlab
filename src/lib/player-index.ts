/**
 * Índice local de jugadores para sugerir perfiles mientras se escribe en el
 * buscador. La API de Riot solo busca por Riot ID exacto, así que se guardan
 * los jugadores que ya pasaron por la app: los de las partidas que junta el
 * agregador y los de los perfiles que se abren.
 *
 * Un archivo por servidor (data/players/<servidor>.json), con filas cortas
 * para que pese poco. Sin dependencias de Next: lo usa también el agregador.
 */

/** [nombre, tag, ícono, nivel, división ("GOLD"), escalón ("II"), LP, visto (segundos)] */
export type PlayerRow = [string, string, number, number, string | null, string | null, number | null, number];
export type PlayerIndex = Record<string, PlayerRow>;

export interface PlayerSeen {
  puuid: string;
  gameName: string;
  tagLine: string;
  icon?: number;
  level?: number;
  tier?: string | null;
  rank?: string | null;
  lp?: number | null;
}

/** Agrega o actualiza un jugador sin perder el rango que ya se conocía si esta vez no viene. */
export function upsertPlayer(index: PlayerIndex, p: PlayerSeen, now = Math.floor(Date.now() / 1000)) {
  if (!p.puuid || !p.gameName || !p.tagLine) return;
  const prev = index[p.puuid];
  index[p.puuid] = [
    p.gameName,
    p.tagLine,
    p.icon ?? prev?.[2] ?? 0,
    p.level ?? prev?.[3] ?? 0,
    p.tier !== undefined ? p.tier : (prev?.[4] ?? null),
    p.rank !== undefined ? p.rank : (prev?.[5] ?? null),
    p.lp !== undefined ? p.lp : (prev?.[6] ?? null),
    now,
  ];
}

/** "Kai'Sa" → "kaisa": se compara sin tildes, mayúsculas ni signos. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s'".\-_]/g, "");
}
