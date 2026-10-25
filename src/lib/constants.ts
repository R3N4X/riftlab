export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  TOP: "Superior",
  JUNGLE: "Jungla",
  MIDDLE: "Central",
  BOTTOM: "Tirador",
  UTILITY: "Soporte",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Divisiones que se registran tal cual en el dataset. */
export const TIERS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = {
  IRON: "Hierro",
  BRONZE: "Bronce",
  SILVER: "Plata",
  GOLD: "Oro",
  PLATINUM: "Platino",
  EMERALD: "Esmeralda",
  DIAMOND: "Diamante",
  MASTER: "Maestro",
  GRANDMASTER: "Gran Maestro",
  CHALLENGER: "Retador",
};

/** Filtros de rango que ofrece la UI (se arman sumando divisiones). */
export const RANK_FILTERS = {
  ALL: { label: "Todos", tiers: [...TIERS] },
  IRON: { label: "Hierro", tiers: ["IRON"] },
  BRONZE: { label: "Bronce", tiers: ["BRONZE"] },
  SILVER: { label: "Plata", tiers: ["SILVER"] },
  GOLD: { label: "Oro", tiers: ["GOLD"] },
  PLATINUM: { label: "Platino", tiers: ["PLATINUM"] },
  PLATINUM_PLUS: { label: "Platino+", tiers: ["PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] },
  EMERALD: { label: "Esmeralda", tiers: ["EMERALD"] },
  EMERALD_PLUS: { label: "Esmeralda+", tiers: ["EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] },
  DIAMOND_PLUS: { label: "Diamante+", tiers: ["DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] },
  MASTER_PLUS: { label: "Maestro+", tiers: ["MASTER", "GRANDMASTER", "CHALLENGER"] },
} satisfies Record<string, { label: string; tiers: Tier[] }>;
export type RankFilter = keyof typeof RANK_FILTERS;
// Todos los rangos juntos: con la muestra actual, filtrar por división deja muy pocas partidas.
export const DEFAULT_RANK: RankFilter = "ALL";

export function isRankFilter(value: unknown): value is RankFilter {
  return typeof value === "string" && value in RANK_FILTERS;
}

/** Servidores (plataformas) y su clúster regional para match-v5 / account-v1. */
export const PLATFORMS = {
  la1: { label: "LAN", region: "americas" },
  la2: { label: "LAS", region: "americas" },
  na1: { label: "NA", region: "americas" },
  br1: { label: "BR", region: "americas" },
  euw1: { label: "EUW", region: "europe" },
  eun1: { label: "EUNE", region: "europe" },
  tr1: { label: "TR", region: "europe" },
  ru: { label: "RU", region: "europe" },
  me1: { label: "ME", region: "europe" },
  kr: { label: "KR", region: "asia" },
  jp1: { label: "JP", region: "asia" },
  oc1: { label: "OCE", region: "sea" },
  sg2: { label: "SEA", region: "sea" },
  tw2: { label: "TW", region: "sea" },
  vn2: { label: "VN", region: "sea" },
} as const;
export type Platform = keyof typeof PLATFORMS;
export const DEFAULT_PLATFORM: Platform = "la2";

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && value in PLATFORMS;
}

export const QUEUES: Record<number, string> = {
  0: "Personalizada",
  400: "Normal (Reclutamiento)",
  420: "Clasificatoria Solo/Dúo",
  430: "Normal (Ciega)",
  440: "Clasificatoria Flexible",
  450: "ARAM",
  480: "Partida rápida",
  490: "Partida rápida",
  700: "Clash",
  720: "ARAM Clash",
  830: "Coop vs IA",
  840: "Coop vs IA",
  850: "Coop vs IA",
  870: "Coop vs IA",
  880: "Coop vs IA",
  890: "Coop vs IA",
  900: "ARURF",
  1020: "Uno para todos",
  1300: "Nexus Blitz",
  1700: "Arena",
  1710: "Arena",
  1900: "URF",
  2300: "Brawl",
  2400: "ARAM: Caos",
};

/** Escalas de tier usadas en la tier list. */
export const TIER_GRADES = ["S+", "S", "A", "B", "C", "D"] as const;
export type TierGrade = (typeof TIER_GRADES)[number];
