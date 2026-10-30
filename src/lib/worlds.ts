/*
 * Calendario de Worlds 2026, temporal: el botón de la barra lateral desaparece solo después de la
 * final. La API de Riot no trae esports: este calendario se cargó a mano (lolesports.com y
 * Wikipedia) y los equipos y marcadores se completan solos desde Leaguepedia (worlds-live.ts).
 * Lo de aquí queda como respaldo si la wiki no responde. Las horas van en UTC y la página las
 * muestra en la hora del equipo de cada uno.
 */

export type Region = "LCK" | "LPL" | "LEC" | "LCS" | "LCP" | "CBLOL";

export const TEAMS = {
  GEN: { name: "Gen.G", region: "LCK", logo: "1773829250929_GENGLOGO_GOLD.png" },
  HLE: { name: "Hanwha Life Esports", region: "LCK", logo: "1631819564399_hle-2021-worlds.png" },
  T1: { name: "T1", region: "LCK", logo: "1726801573959_539px-T1_2019_full_allmode.png" },
  DK: { name: "Dplus KIA", region: "LCK", logo: "1673260049703_DPlusKIALOGO11.png" },
  AL: { name: "Anyone's Legend", region: "LPL", logo: "1641199582689_.png" },
  BLG: { name: "Bilibili Gaming", region: "LPL", logo: "1682322954525_Bilibili_Gaming_logo_20211.png" },
  TES: { name: "Top Esports", region: "LPL", logo: "1592592064571_TopEsportsTES-01-FullonDark.png" },
  IG: { name: "Invictus Gaming", region: "LPL", logo: "1634762917340_300px-Invictus_Gaming_logo.png" },
  G2: { name: "G2 Esports", region: "LEC", logo: "G2-FullonDark.png" },
  MKOI: { name: "Movistar KOI", region: "LEC", logo: "1734012609283_MKOI_FullColor_Blue.png" },
  KC: { name: "Karmine Corp", region: "LEC", logo: "1704714951336_KC.png" },
  TL: { name: "Team Liquid", region: "LCS", logo: "1769357207762_TLAlienware_Minimal_Bug-White.png" },
  LYON: { name: "LYON", region: "LCS", logo: "1743717443673_isotypelyon-03.png" },
  C9: { name: "Cloud9", region: "LCS", logo: "1736924120254_C9Kia_IconBlue_Transparent_2000x2000.png" },
  TSW: { name: "Team Secret Whales", region: "LCP", logo: "1774598000328_White_EyeText_600p.png" },
  CFO: { name: "CTBC Flying Oyster", region: "LCP", logo: "1656307849320_CFO_Logo.png" },
  MVK: { name: "MVK Esports", region: "LCP", logo: "1767089709161_White_Logo.png" },
  LOS: { name: "Los Grandes", region: "CBLOL", logo: "1784013312149_LOS-OLaranja.png" },
  FUR: { name: "FURIA", region: "CBLOL", logo: "FURIA---black.png" },
} satisfies Record<string, { name: string; region: Region; logo: string }>;

export type TeamCode = keyof typeof TEAMS;

/*
 * Logos del CDN de lolesports (los mismos que usa su sitio), pasados por su servicio de
 * redimensionado para no bajar imágenes de 2000 px. No se guardan en el repositorio.
 */
export function teamLogo(code: TeamCode, size = 64): string {
  return `https://am-a.akamaihd.net/image?resize=${size}:&f=${encodeURIComponent(`http://static.lolesports.com/teams/${TEAMS[code].logo}`)}`;
}

export type StageId = "playin" | "swiss" | "cuartos" | "semis" | "final";

export const STAGES: { id: StageId; label: string; dates: string; place: string; start: string; end: string }[] = [
  { id: "playin", label: "Play-In", dates: "15 al 18 de octubre", place: "Los Ángeles", start: "2026-10-15", end: "2026-10-18" },
  { id: "swiss", label: "Fase suiza", dates: "23 al 31 de octubre", place: "Allen, Texas", start: "2026-10-23", end: "2026-10-31" },
  { id: "cuartos", label: "Cuartos de final", dates: "3 al 6 de noviembre", place: "Allen, Texas", start: "2026-11-03", end: "2026-11-06" },
  { id: "semis", label: "Semifinales", dates: "7 y 8 de noviembre", place: "Allen, Texas", start: "2026-11-07", end: "2026-11-08" },
  { id: "final", label: "Final", dates: "14 de noviembre", place: "Nueva York", start: "2026-11-14", end: "2026-11-14" },
];

export interface WorldsMatch {
  stage: StageId;
  /** Ronda o llave dentro de la etapa, para mostrar debajo del día. */
  round: string;
  /** Hora programada en UTC; las partidas que no son la primera del día pueden atrasarse. */
  start: string;
  bestOf: 1 | 3 | 5;
  /** null mientras no se sabe quién juega. */
  teams: [TeamCode | null, TeamCode | null];
  /** Mapas ganados por cada equipo; solo en partidas terminadas. */
  score?: [number, number];
}

/** Día después de la final: desde ahí el botón de la barra lateral ya no aparece. */
export const WORLDS_END = Date.parse("2026-11-15T12:00:00Z");

export const SCHEDULE_UPDATED = "30 de octubre";

const m = (
  stage: StageId,
  round: string,
  start: string,
  bestOf: 1 | 3 | 5,
  a: TeamCode | null,
  b: TeamCode | null,
  score?: [number, number],
): WorldsMatch => ({ stage, round, start, bestOf, teams: [a, b], score });

export const MATCHES: WorldsMatch[] = [
  // Play-In en Los Ángeles: 11:00 y 16:00 PDT (UTC−7).
  m("playin", "Ronda 1", "2026-10-15T18:00:00Z", 5, "C9", "KC", [2, 3]),
  m("playin", "Ronda 1", "2026-10-15T23:00:00Z", 5, "FUR", "MVK", [0, 3]),
  m("playin", "Llave de ganadores", "2026-10-16T18:00:00Z", 5, "KC", "MVK", [3, 0]),
  m("playin", "Llave de perdedores", "2026-10-16T23:00:00Z", 5, "C9", "FUR", [1, 3]),
  m("playin", "Llave de perdedores", "2026-10-17T18:00:00Z", 5, "MVK", "FUR", [3, 1]),
  m("playin", "Clasificación", "2026-10-18T18:00:00Z", 5, "KC", "MVK", [3, 0]),

  // Fase suiza en Allen: CDT (UTC−5).
  m("swiss", "Ronda 1", "2026-10-23T17:00:00Z", 1, "GEN", "IG", [1, 0]),
  m("swiss", "Ronda 1", "2026-10-23T18:00:00Z", 1, "HLE", "TES", [1, 0]),
  m("swiss", "Ronda 1", "2026-10-23T19:00:00Z", 1, "BLG", "MKOI", [0, 1]),
  m("swiss", "Ronda 1", "2026-10-23T20:00:00Z", 1, "AL", "KC", [0, 1]),
  m("swiss", "Ronda 1", "2026-10-23T21:00:00Z", 1, "G2", "DK", [0, 1]),
  m("swiss", "Ronda 1", "2026-10-23T22:00:00Z", 1, "TL", "CFO", [0, 1]),
  m("swiss", "Ronda 1", "2026-10-23T23:00:00Z", 1, "LOS", "T1", [0, 1]),
  m("swiss", "Ronda 1", "2026-10-24T00:00:00Z", 1, "TSW", "LYON", [0, 1]),

  m("swiss", "Ronda 2", "2026-10-24T17:00:00Z", 1, "TES", "AL", [1, 0]),
  m("swiss", "Ronda 2", "2026-10-24T18:00:00Z", 1, "CFO", "MKOI", [0, 1]),
  m("swiss", "Ronda 2", "2026-10-24T19:00:00Z", 1, "G2", "LOS", [1, 0]),
  m("swiss", "Ronda 2", "2026-10-24T20:00:00Z", 1, "LYON", "KC", [1, 0]),
  m("swiss", "Ronda 2", "2026-10-24T21:00:00Z", 1, "IG", "TSW", [1, 0]),
  m("swiss", "Ronda 2", "2026-10-24T22:00:00Z", 1, "HLE", "GEN", [0, 1]),
  m("swiss", "Ronda 2", "2026-10-24T23:00:00Z", 1, "DK", "T1", [1, 0]),
  m("swiss", "Ronda 2", "2026-10-25T00:00:00Z", 1, "TL", "BLG", [0, 1]),

  m("swiss", "Ronda 3", "2026-10-25T17:00:00Z", 1, "HLE", "IG", [0, 1]),
  m("swiss", "Ronda 3", "2026-10-25T18:00:00Z", 1, "TES", "G2", [1, 0]),
  m("swiss", "Ronda 3", "2026-10-25T19:00:00Z", 3, "DK", "MKOI", [2, 0]),
  m("swiss", "Ronda 3", "2026-10-25T22:00:00Z", 3, "GEN", "LYON", [2, 1]),
  m("swiss", "Ronda 3", "2026-10-26T17:00:00Z", 1, "T1", "CFO", [1, 0]),
  m("swiss", "Ronda 3", "2026-10-26T18:00:00Z", 1, "KC", "BLG", [0, 1]),
  m("swiss", "Ronda 3", "2026-10-26T19:00:00Z", 3, "LOS", "TSW", [2, 0]),
  m("swiss", "Ronda 3", "2026-10-26T22:00:00Z", 3, "AL", "TL", [0, 2]),

  m("swiss", "Ronda 4", "2026-10-28T20:00:00Z", 3, "MKOI", "T1", [0, 2]),
  m("swiss", "Ronda 4", "2026-10-28T23:00:00Z", 3, "IG", "LYON", [2, 1]),
  m("swiss", "Ronda 4", "2026-10-29T20:00:00Z", 3, "KC", "CFO", [2, 0]),
  m("swiss", "Ronda 4", "2026-10-29T23:00:00Z", 3, "TES", "BLG", [2, 1]),
  m("swiss", "Ronda 4", "2026-10-30T20:00:00Z", 3, "TL", "LOS"),
  m("swiss", "Ronda 4", "2026-10-30T23:00:00Z", 3, "HLE", "G2"),

  m("swiss", "Ronda 5", "2026-10-31T17:00:00Z", 3, null, null),
  m("swiss", "Ronda 5", "2026-10-31T20:00:00Z", 3, null, null),
  m("swiss", "Ronda 5", "2026-10-31T23:00:00Z", 3, null, null),

  // Eliminatorias: desde el 1 de noviembre Texas está en CST (UTC−6); la final, en EST (UTC−5).
  m("cuartos", "Cuartos de final", "2026-11-03T22:00:00Z", 5, null, null),
  m("cuartos", "Cuartos de final", "2026-11-04T22:00:00Z", 5, null, null),
  m("cuartos", "Cuartos de final", "2026-11-05T22:00:00Z", 5, null, null),
  m("cuartos", "Cuartos de final", "2026-11-06T22:00:00Z", 5, null, null),
  m("semis", "Semifinal", "2026-11-07T22:00:00Z", 5, null, null),
  m("semis", "Semifinal", "2026-11-08T22:00:00Z", 5, null, null),
  m("final", "Final", "2026-11-14T19:00:00Z", 5, null, null),
];

export interface SwissRecord {
  team: TeamCode;
  wins: number;
  losses: number;
}

/** Récord de cada equipo en la fase suiza: 3 victorias clasifica, 3 derrotas elimina. */
export function swissStandings(matches: WorldsMatch[] = MATCHES): SwissRecord[] {
  const table = new Map<TeamCode, SwissRecord>();
  for (const match of matches) {
    if (match.stage !== "swiss") continue;
    const [a, b] = match.teams;
    for (const team of [a, b]) if (team && !table.has(team)) table.set(team, { team, wins: 0, losses: 0 });
    if (!a || !b || !match.score) continue;
    const winner = match.score[0] > match.score[1] ? a : b;
    for (const team of [a, b]) {
      const row = table.get(team)!;
      if (team === winner) row.wins++;
      else row.losses++;
    }
  }
  return [...table.values()];
}

/** Récord con el que cada equipo llega a cada serie de la fase suiza ("1-0", "2-2"...). */
export function swissPools(matches: WorldsMatch[] = MATCHES): Map<WorldsMatch, string> {
  const record = new Map<TeamCode, [number, number]>();
  const pools = new Map<WorldsMatch, string>();
  const swiss = matches.filter((m) => m.stage === "swiss").sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  for (const match of swiss) {
    const [a, b] = match.teams;
    if (!a || !b) {
      // Sin rivales todavía: la ronda 5 siempre es entre equipos 2-2.
      pools.set(match, match.round === "Ronda 5" ? "2-2" : "");
      continue;
    }
    const [w, l] = record.get(a) ?? [0, 0];
    pools.set(match, `${w}-${l}`);
    if (!match.score) continue;
    const winner = match.score[0] > match.score[1] ? a : b;
    for (const team of [a, b]) {
      const [tw, tl] = record.get(team) ?? [0, 0];
      record.set(team, team === winner ? [tw + 1, tl] : [tw, tl + 1]);
    }
  }
  return pools;
}

export function worldsRunning(now = Date.now()): boolean {
  return now < WORLDS_END;
}
