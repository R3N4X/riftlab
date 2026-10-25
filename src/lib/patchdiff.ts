/**
 * Diferencias detectadas automáticamente entre dos versiones de Data Dragon:
 * estadísticas base de campeones y costo/estadísticas de objetos.
 * Complementa las notas oficiales (que no siempre listan los micro-ajustes).
 */
import { cacheLife } from "next/cache";
import { getChampions, getItems, getVersions } from "./ddragon";

export interface StatDiff {
  stat: string;
  before: number;
  after: number;
}

export interface EntityDiff {
  id: string;
  name: string;
  kind: "champion" | "item";
  status: "changed" | "new" | "removed";
  diffs: StatDiff[];
}

const CHAMP_STAT_LABEL: Record<string, string> = {
  hp: "Vida",
  hpperlevel: "Vida por nivel",
  mp: "Maná",
  mpperlevel: "Maná por nivel",
  movespeed: "Velocidad de movimiento",
  armor: "Armadura",
  armorperlevel: "Armadura por nivel",
  spellblock: "Resistencia mágica",
  spellblockperlevel: "Resistencia mágica por nivel",
  attackrange: "Alcance",
  hpregen: "Regeneración de vida",
  hpregenperlevel: "Regeneración de vida por nivel",
  mpregen: "Regeneración de maná",
  mpregenperlevel: "Regeneración de maná por nivel",
  attackdamage: "Daño de ataque",
  attackdamageperlevel: "Daño de ataque por nivel",
  attackspeedperlevel: "Velocidad de ataque por nivel",
  attackspeed: "Velocidad de ataque",
};

export async function getDataDragonDiff(): Promise<{ from: string; to: string; entries: EntityDiff[] }> {
  "use cache";
  cacheLife("hours");
  const versions = await getVersions();
  const [to, from] = versions;
  const [newChamps, oldChamps, newItems, oldItems] = await Promise.all([
    getChampions(to),
    getChampions(from),
    getItems(to),
    getItems(from),
  ]);

  const entries: EntityDiff[] = [];

  for (const [id, champ] of Object.entries(newChamps)) {
    const prev = oldChamps[id];
    if (!prev) {
      entries.push({ id, name: champ.name, kind: "champion", status: "new", diffs: [] });
      continue;
    }
    const diffs: StatDiff[] = [];
    for (const [stat, value] of Object.entries(champ.stats)) {
      const before = prev.stats[stat];
      if (before !== undefined && before !== value) diffs.push({ stat: CHAMP_STAT_LABEL[stat] ?? stat, before, after: value });
    }
    if (diffs.length) entries.push({ id, name: champ.name, kind: "champion", status: "changed", diffs });
  }

  const onRift = (it: { maps: Record<string, boolean>; gold: { purchasable: boolean } }) => it.maps["11"] && it.gold.purchasable;
  for (const [id, item] of Object.entries(newItems)) {
    if (!onRift(item) || Number(id) > 10000) continue;
    const prev = oldItems[id];
    if (!prev || !onRift(prev)) {
      entries.push({ id, name: item.name, kind: "item", status: "new", diffs: [] });
      continue;
    }
    const diffs: StatDiff[] = [];
    if (prev.gold.total !== item.gold.total) diffs.push({ stat: "Costo total", before: prev.gold.total, after: item.gold.total });
    const keys = new Set([...Object.keys(item.stats), ...Object.keys(prev.stats)]);
    for (const k of keys) {
      const a = prev.stats[k] ?? 0;
      const b = item.stats[k] ?? 0;
      if (a !== b) diffs.push({ stat: k.replace(/^Flat|Mod$/g, ""), before: a, after: b });
    }
    if (diffs.length) entries.push({ id, name: item.name, kind: "item", status: "changed", diffs });
  }
  for (const [id, item] of Object.entries(oldItems)) {
    if (onRift(item) && Number(id) < 10000 && (!newItems[id] || !onRift(newItems[id]))) {
      entries.push({ id, name: item.name, kind: "item", status: "removed", diffs: [] });
    }
  }

  return { from, to, entries };
}
