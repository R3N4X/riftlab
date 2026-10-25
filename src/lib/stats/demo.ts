/**
 * Dataset de DEMOSTRACIÓN. Genera conteos verosímiles y deterministas
 * (misma semilla → mismos números) a partir de los campeones, objetos y runas
 * reales del parche, para que toda la UI funcione sin API key.
 *
 * No son estadísticas reales: la UI lo indica con un aviso. Para datos reales
 * se ejecuta `npm run aggregate` (ver scripts/aggregate.ts).
 */
import positions from "@/data/positions.json";
import { ROLES, TIERS, type Role, type Tier } from "../constants";
import type { ChampionSummary, Item } from "../ddragon";
import { pairKey } from "./keys";
import type { ChampionAgg, CountMap, Counts, MetaDataset, RoleAgg } from "./types";

/* ---------- RNG determinista ---------- */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let a = hashString(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    shuffle: <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/* ---------- Arquetipos ---------- */

type Archetype = "adc" | "mage" | "assassin" | "bruiser" | "tank" | "enchanter" | "onhit";

function archetypeOf(c: ChampionSummary, role: Role): Archetype {
  const tags = c.tags;
  const ap = c.info.magic > c.info.attack;
  if (role === "UTILITY") return tags.includes("Tank") || tags.includes("Fighter") ? "tank" : ap ? "enchanter" : "adc";
  if (tags[0] === "Marksman") return ap ? "onhit" : "adc";
  if (tags[0] === "Tank") return "tank";
  if (tags[0] === "Mage" || tags[0] === "Support") return "mage";
  if (tags[0] === "Assassin") return ap ? "mage" : "assassin";
  return ap ? "mage" : "bruiser";
}

const ARCH_TAGS: Record<Archetype, string[]> = {
  adc: ["CriticalStrike", "AttackSpeed", "Damage"],
  onhit: ["OnHit", "AttackSpeed", "SpellDamage"],
  mage: ["SpellDamage", "MagicPenetration", "Mana", "AbilityHaste"],
  assassin: ["ArmorPenetration", "Damage", "AbilityHaste"],
  bruiser: ["Damage", "Health", "AbilityHaste"],
  tank: ["Health", "Armor", "SpellBlock", "Aura"],
  enchanter: ["ManaRegen", "SpellDamage", "AbilityHaste", "Aura"],
};

/** Filtro duro: qué objetos tienen sentido para cada arquetipo. */
const ARCH_REQUIRES: Record<Archetype, (tags: string[]) => boolean> = {
  adc: (t) => t.includes("CriticalStrike") || (t.includes("Damage") && t.includes("AttackSpeed")),
  onhit: (t) => t.includes("OnHit") || t.includes("AttackSpeed"),
  mage: (t) => t.includes("SpellDamage") && !t.includes("AttackSpeed") && !t.includes("ManaRegen"),
  assassin: (t) => t.includes("Damage") && (t.includes("ArmorPenetration") || t.includes("AbilityHaste")) && !t.includes("CriticalStrike"),
  bruiser: (t) => t.includes("Damage") && (t.includes("Health") || t.includes("LifeSteal")) && !t.includes("CriticalStrike"),
  tank: (t) => t.includes("Health") && (t.includes("Armor") || t.includes("SpellBlock")) && !t.includes("Damage") && !t.includes("SpellDamage"),
  enchanter: (t) => t.includes("ManaRegen") || (t.includes("Aura") && !t.includes("Damage")),
};

/** [árbol principal, keystones candidatas]. */
const ARCH_RUNES: Record<Archetype, [number, number[]][]> = {
  adc: [[8000, [8008, 8021, 8005]]],
  onhit: [[8000, [8008, 8005]], [8100, [9923]]],
  mage: [[8200, [8229, 8992, 8230]], [8100, [8112]]],
  assassin: [[8100, [8112, 8128, 9923]]],
  bruiser: [[8000, [8010, 8005]], [8400, [8437]]],
  tank: [[8400, [8437, 8439, 8465]]],
  enchanter: [[8200, [8214]], [8300, [8369]], [8400, [8465]]],
};

const ARCH_BOOTS: Record<Archetype, string[]> = {
  adc: ["3006", "3009"],
  onhit: ["3006", "3020"],
  mage: ["3020", "3158"],
  assassin: ["3047", "3158", "3111"],
  bruiser: ["3047", "3111", "3158"],
  tank: ["3047", "3111"],
  enchanter: ["3158", "3009", "3020"],
};

const ARCH_SHARDS: Record<Archetype, string> = {
  adc: "5005,5008,5011",
  onhit: "5005,5008,5011",
  mage: "5008,5008,5011",
  assassin: "5008,5008,5011",
  bruiser: "5008,5008,5011",
  tank: "5007,5001,5011",
  enchanter: "5007,5008,5011",
};

/** Árbol de runas → filas (sin la keystone). Ids del parche 26.x. */
const TREE_ROWS: Record<number, number[][]> = {
  8000: [[9101, 9111, 8009], [9104, 9105, 9103], [8014, 8017, 8299]],
  8100: [[8126, 8139, 8143], [8137, 8140, 8141], [8135, 8105, 8106]],
  8200: [[8224, 8226, 8275], [8210, 8234, 8233], [8237, 8232, 8236]],
  8300: [[8306, 8304, 8321], [8313, 8352, 8345], [8347, 8410, 8316]],
  8400: [[8446, 8463, 8401], [8429, 8444, 8473], [8451, 8453, 8242]],
};

function starterFor(arch: Archetype, role: Role): string {
  if (role === "JUNGLE") return "1101";
  if (role === "UTILITY") return "3865-2003";
  if (arch === "mage" || arch === "enchanter") return "1056-2003";
  if (arch === "tank") return "1054-2003";
  return "1055-2003";
}

function spellsFor(role: Role, r: ReturnType<typeof rng>): string[] {
  const opts: Record<Role, string[]> = {
    TOP: ["4-12", "4-14", "4-6"],
    JUNGLE: ["4-11", "6-11"],
    MIDDLE: ["4-14", "4-12", "4-21"],
    BOTTOM: ["4-7", "4-21", "1-4"],
    UTILITY: ["4-14", "3-4", "4-7"],
  };
  return r.shuffle(opts[role]);
}

/** Secuencia de 15 niveles a partir del orden de maximización (p. ej. "QEW"). */
function skillSequence(maxOrder: string): string {
  const [a, b, c] = maxOrder.split("");
  const seq = [a, b, c];
  const levels: Record<string, number> = { [a]: 1, [b]: 1, [c]: 1, R: 0 };
  for (let lvl = 4; lvl <= 15; lvl++) {
    if ([6, 11].includes(lvl)) {
      seq.push("R");
      levels.R++;
      continue;
    }
    const next = [a, b, c].find((s) => levels[s] < 5)!;
    seq.push(next);
    levels[next]++;
  }
  return seq.join("");
}

/* ---------- Generador ---------- */

const MATCHES_PER_TIER: Record<Tier, number> = {
  IRON: 9000,
  BRONZE: 32000,
  SILVER: 48000,
  GOLD: 52000,
  PLATINUM: 46000,
  EMERALD: 41000,
  DIAMOND: 19000,
  MASTER: 5200,
  GRANDMASTER: 1600,
  CHALLENGER: 700,
};

function fallbackRoles(c: ChampionSummary): Role[] {
  const t = c.tags[0];
  if (t === "Marksman") return ["BOTTOM"];
  if (t === "Support") return ["UTILITY"];
  if (t === "Mage") return ["MIDDLE"];
  if (t === "Assassin") return ["MIDDLE"];
  if (t === "Tank") return ["TOP", "UTILITY"];
  return ["TOP"];
}

const counts = (games: number, wr: number): Counts => {
  const g = Math.max(0, Math.round(games));
  return { games: g, wins: Math.round(g * Math.min(Math.max(wr, 0.3), 0.7)) };
};

export function buildDemoDataset(
  patch: string,
  champions: ChampionSummary[],
  items: Record<string, Item>,
): MetaDataset {
  const posMap = positions as Record<string, Role[]>;

  // Objetos completos de la Grieta, agrupados por afinidad con cada arquetipo.
  const finals = Object.values(items).filter(
    (i) =>
      i.maps["11"] &&
      i.gold.purchasable &&
      !i.into &&
      i.gold.total >= 2000 &&
      !i.requiredChampion &&
      i.inStore !== false &&
      !i.tags.includes("Boots") &&
      !i.tags.includes("Consumable") &&
      Number(i.id) < 10000,
  );
  const poolFor = (arch: Archetype) => {
    const wanted = ARCH_TAGS[arch];
    return finals
      .filter((i) => ARCH_REQUIRES[arch](i.tags))
      .map((i) => ({ id: i.id, score: i.tags.filter((t) => wanted.includes(t)).length }))
      .filter((x) => x.score >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 14)
      .map((x) => x.id);
  };

  // 1) Posiciones y "fuerza" oculta de cada campeón-rol.
  type Slot = { champ: ChampionSummary; role: Role; weight: number; strength: number; pop: number };
  const slots: Slot[] = [];
  for (const champ of champions) {
    const roles = posMap[champ.id] ?? fallbackRoles(champ);
    const r = rng(`${patch}:${champ.id}`);
    const pop = Math.exp(r.normal(0, 0.75)); // popularidad base log-normal
    roles.forEach((role, i) => {
      slots.push({
        champ,
        role,
        weight: i === 0 ? 1 : 0.3 / i,
        strength: r.normal(0, 1),
        pop: pop * (i === 0 ? 1 : 0.35 / i),
      });
    });
  }

  const byRole = Object.fromEntries(ROLES.map((role) => [role, slots.filter((s) => s.role === role)])) as Record<Role, Slot[]>;
  const popSum = Object.fromEntries(ROLES.map((role) => [role, byRole[role].reduce((s, x) => s + x.pop, 0)])) as Record<Role, number>;

  const dataset: MetaDataset = {
    version: 1,
    source: "demo",
    patch,
    generatedAt: new Date(0).toISOString(),
    platforms: [],
    matches: { ...MATCHES_PER_TIER },
    champions: {},
    duos: {},
    teammates: {},
  };

  const totalMatches = Object.values(MATCHES_PER_TIER).reduce((a, b) => a + b, 0);

  for (const slot of slots) {
    const { champ, role } = slot;
    const r = rng(`${patch}:${champ.id}:${role}`);
    const share = slot.pop / popSum[role];
    const arch = archetypeOf(champ, role);
    const diff = (champ.info.difficulty - 5) / 5; // -1..1

    const agg: RoleAgg = {
      byTier: {},
      core: {},
      late: {},
      boots: {},
      starters: {},
      runes: {},
      spells: {},
      skills: {},
      matchups: {},
    };

    // Rendimiento por división: los campeones difíciles rinden mejor en elo alto.
    TIERS.forEach((tier, idx) => {
      const eloFactor = (idx - 4.5) / 4.5; // -1 (hierro) .. 1 (retador)
      const wr = 0.5 + slot.strength * 0.016 + diff * eloFactor * 0.012 + r.normal(0, 0.004);
      const tierPop = share * (1 + diff * eloFactor * 0.35) * (1 + r.normal(0, 0.08));
      agg.byTier[tier] = counts(MATCHES_PER_TIER[tier] * 2 * tierPop, wr);
    });

    const roleGames = Object.values(agg.byTier).reduce((s, c) => s + (c?.games ?? 0), 0);
    const baseWr = 0.5 + slot.strength * 0.016;

    // Builds: el más popular gana un poco más, los demás se reparten el resto.
    const split = (keys: string[], map: CountMap, total: number, spread = 0.012) => {
      const weights = keys.map((_, i) => Math.pow(0.45, i) * (0.8 + r.next() * 0.4));
      const wsum = weights.reduce((a, b) => a + b, 0);
      keys.forEach((k, i) => {
        map[k] = counts((total * weights[i]) / wsum, baseWr + r.normal(0, spread) - i * 0.002);
      });
    };

    const pool = poolFor(arch);
    const cores = Array.from({ length: 4 }, () => r.shuffle(pool).slice(0, 3).join("-"));
    split([...new Set(cores)], agg.core, roleGames * 0.62);
    split(r.shuffle(pool).slice(0, 8), agg.late, roleGames * 0.9, 0.02);
    split(r.shuffle(ARCH_BOOTS[arch]), agg.boots, role === "JUNGLE" && arch === "assassin" ? roleGames * 0.5 : roleGames * 0.85);
    split([starterFor(arch, role), ...(role === "JUNGLE" ? ["1102", "1103"] : [])], agg.starters, roleGames);
    split(spellsFor(role, r), agg.spells, roleGames, 0.006);

    // La mayoría de campeones maximiza Q primero; se deja algo de variedad.
    const maxOrders = r.next() < 0.75 ? [...r.shuffle(["QWE", "QEW"]), r.pick(["EQW", "WQE"])] : r.shuffle(["QWE", "QEW", "EQW", "WQE"]).slice(0, 3);
    split(maxOrders.map(skillSequence), agg.skills, roleGames * 0.95, 0.008);

    // Runas: 2-3 páginas a partir de los keystones del arquetipo.
    const pages: string[] = [];
    for (const [tree, keystones] of ARCH_RUNES[arch]) {
      for (const ks of keystones.slice(0, 2)) {
        const rows = TREE_ROWS[tree].map((row) => r.pick(row));
        const secTree = r.pick(Object.keys(TREE_ROWS).map(Number).filter((t) => t !== tree));
        const [ra, rb] = r.shuffle([0, 1, 2]).slice(0, 2).sort();
        const sec = [r.pick(TREE_ROWS[secTree][ra]), r.pick(TREE_ROWS[secTree][rb])];
        pages.push(`${tree}:${ks},${rows.join(",")}|${secTree}:${sec.join(",")}|${ARCH_SHARDS[arch]}`);
      }
    }
    split(r.shuffle(pages).slice(0, 3), agg.runes, roleGames * 0.92);

    // Enfrentamientos contra rivales de la misma línea.
    for (const opp of byRole[role]) {
      if (opp.champ.id === champ.id) continue;
      const oppShare = opp.pop / popSum[role];
      const g = roleGames * oppShare * (0.9 + r.next() * 0.2);
      if (g < 30) continue;
      const wr = 0.5 + (slot.strength - opp.strength) * 0.012 + r.normal(0, 0.02);
      agg.matchups[opp.champ.key] = counts(g, wr);
    }

    const champAgg: ChampionAgg = (dataset.champions[champ.key] ??= { bans: {}, roles: {} });
    champAgg.roles[role] = agg;

    // Bloqueos: los fuertes y populares se bloquean más.
    if (slot.weight === 1) {
      TIERS.forEach((tier) => {
        const rate = Math.min(0.55, Math.max(0.002, share * 2.2 * Math.exp(slot.strength * 0.7) * (0.6 + r.next() * 0.8)));
        champAgg.bans[tier] = Math.round(MATCHES_PER_TIER[tier] * rate);
      });
    }

    // Aliados frecuentes (para sinergias de equipo).
    if (slot.weight === 1) {
      for (const otherRole of ROLES) {
        if (otherRole === role) continue;
        const candidates = byRole[otherRole].filter((o) => o.champ.id !== champ.id && o.weight === 1);
        for (const mate of r.shuffle(candidates).slice(0, 6)) {
          const key = pairKey(champ.key, role, mate.champ.key, otherRole);
          if (dataset.teammates[key]) continue;
          const g = totalMatches * 2 * share * (mate.pop / popSum[otherRole]) * (2 + r.next() * 6);
          if (g < 60) continue;
          const wr = 0.5 + (slot.strength + mate.strength) * 0.009 + r.normal(0.004, 0.018);
          dataset.teammates[key] = counts(g, wr);
        }
      }
    }
  }

  // Dúos de línea inferior.
  for (const adc of byRole.BOTTOM) {
    for (const sup of byRole.UTILITY) {
      if (adc.champ.id === sup.champ.id) continue;
      const r = rng(`${patch}:duo:${adc.champ.id}:${sup.champ.id}`);
      const pairShare = (adc.pop / popSum.BOTTOM) * (sup.pop / popSum.UTILITY) * (0.5 + r.next() * 1.5);
      const synergy = r.normal(0, 0.016);
      const byTier: MetaDataset["duos"][string] = {};
      let total = 0;
      TIERS.forEach((tier) => {
        const c = counts(MATCHES_PER_TIER[tier] * 2 * pairShare, 0.5 + (adc.strength + sup.strength) * 0.01 + synergy);
        total += c.games;
        if (c.games > 0) byTier[tier] = c;
      });
      if (total >= 80) dataset.duos[`${adc.champ.key}-${sup.champ.key}`] = byTier;
    }
  }

  return dataset;
}
