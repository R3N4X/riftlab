/**
 * Todos los cambios del parche en una sola lista: las notas oficiales de Riot
 * (campeones, objetos y modos) más lo que detectamos comparando Data Dragon
 * entre versiones. Cada cambio se clasifica como mejora, debilitamiento o
 * ajuste comparando los números de "antes ⇒ después".
 */
import { cacheLife } from "next/cache";
import { DEFAULT_RANK, type Role, type TierGrade } from "./constants";
import { getChampions, getItems, getLatestVersion, img, versionToPatch } from "./ddragon";
import { getDataDragonDiff, type StatDiff } from "./patchdiff";
import { getPatchNote, getPatchNotesList, type PatchChange, type PatchChangeGroup, type PatchNoteSummary } from "./patchnotes";
import { getTierList } from "./stats";

export type Verdict = "buff" | "nerf" | "adjust" | "new";
export type ChangeKind = "champion" | "item" | "other";

export interface ChangeEntry {
  key: string;
  kind: ChangeKind;
  name: string;
  icon: string | null;
  href: string | null;
  verdict: Verdict;
  /** Sección de las notas ("ARAM: Caos", "Arena"...) para cambios que no son de campeón u objeto. */
  section: string | null;
  /** Explicación de Riot (la cita de los diseñadores). */
  context: string | null;
  groups: PatchChangeGroup[];
  /** Cambios de estadísticas detectados en Data Dragon que no estaban en las notas. */
  detected: StatDiff[];
  /** Cómo está rindiendo hoy (solo campeones). */
  current: { tier: TierGrade; winRate: number; role: Role } | null;
}

export interface PatchOverview {
  patch: string;
  note: { slug: string; title: string; url: string; date: string; banner: string | null } | null;
  changes: ChangeEntry[];
  others: PatchNoteSummary[];
}

/* ---------- Clasificación ---------- */

/** En estas estadísticas, bajar es una mejora. */
const LOWER_IS_BETTER = /enfriamiento|costo|coste|tiempo de|tiempo para|lanzamiento|retraso|duración de la ralentización recibida|precio/i;

function numbers(text: string): number[] {
  return (text.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));
}

function changeDirection(c: PatchChange): 1 | -1 | 0 {
  if (!c.before || !c.after) return 0;
  const a = numbers(c.before);
  const b = numbers(c.after);
  if (!a.length || !b.length || a.length !== b.length) return 0;
  const sumA = a.reduce((s, n) => s + n, 0);
  const sumB = b.reduce((s, n) => s + n, 0);
  if (sumA === sumB) return 0;
  const up = sumB > sumA ? 1 : -1;
  return (LOWER_IS_BETTER.test(c.label ?? c.text) ? -up : up) as 1 | -1;
}

export function classify(groups: PatchChangeGroup[], detected: StatDiff[] = []): Verdict {
  let buffs = 0;
  let nerfs = 0;
  for (const g of groups) {
    for (const c of g.changes) {
      if (/^nuev[oa]/i.test(c.label ?? "") || /^nuev[oa]\b/i.test(c.text)) continue;
      const d = changeDirection(c);
      if (d > 0) buffs++;
      if (d < 0) nerfs++;
    }
  }
  for (const d of detected) {
    const better = d.stat === "Costo total" ? d.after < d.before : d.after > d.before;
    if (better) buffs++;
    else nerfs++;
  }
  if (buffs && !nerfs) return "buff";
  if (nerfs && !buffs) return "nerf";
  return "adjust";
}

/* ---------- Armado ---------- */

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export async function getPatchOverview(): Promise<PatchOverview> {
  "use cache";
  cacheLife("hours");
  const version = await getLatestVersion();
  const patch = versionToPatch(version);

  const [list, diff, champs, items, tier] = await Promise.all([
    getPatchNotesList().catch(() => []),
    getDataDragonDiff(),
    getChampions(),
    getItems(),
    getTierList(DEFAULT_RANK),
  ]);

  // Las notas del parche actual (si ya están publicadas) y el resto como noticias.
  const slugFor = `league-of-legends-patch-${patch.replace(".", "-")}-notes`;
  const latest = list.find((n) => n.slug === slugFor) ?? list[0] ?? null;
  const note = latest ? await getPatchNote(latest.slug).catch(() => null) : null;

  const champByName = new Map(Object.values(champs).map((c) => [normalize(c.name), c]));
  const itemByName = new Map(
    Object.values(items)
      .filter((i) => i.maps["11"] && Number(i.id) < 10000)
      .map((i) => [normalize(i.name), i]),
  );
  const bestRow = new Map<string, (typeof tier)[number]>();
  for (const row of tier) if (!bestRow.has(row.champion.id)) bestRow.set(row.champion.id, row);

  const entries = new Map<string, ChangeEntry>();

  for (const section of note?.sections ?? []) {
    const isChamps = section.id === "champions";
    const isItems = section.id === "items";
    for (const block of section.blocks) {
      if (!block.title) continue;
      const hasChanges = block.groups.some((g) => g.changes.length);
      if (!hasChanges) continue;

      if (isChamps) {
        const champ = (block.championId && champs[block.championId]) || champByName.get(normalize(block.title));
        const id = champ?.id ?? block.title;
        entries.set(`champion:${id}`, {
          key: `champion:${id}`,
          kind: "champion",
          name: champ?.name ?? block.title,
          icon: champ ? img.champion(version, champ.id) : block.image,
          href: champ ? `/campeones/${champ.id}?vista=counters` : null,
          verdict: classify(block.groups),
          section: null,
          context: block.context,
          groups: block.groups,
          detected: [],
          current: null,
        });
      } else if (isItems) {
        const item = itemByName.get(normalize(block.title));
        const id = item?.id ?? block.title;
        entries.set(`item:${id}`, {
          key: `item:${id}`,
          kind: "item",
          name: item?.name ?? block.title,
          icon: item ? img.item(version, item.id) : block.image,
          href: null,
          verdict: classify(block.groups),
          section: null,
          context: block.context,
          groups: block.groups,
          detected: [],
          current: null,
        });
      } else if (block.groups.some((g) => g.changes.some((c) => c.after))) {
        // Modos y sistemas: solo los bloques con cambios numéricos concretos.
        entries.set(`other:${section.id}:${block.title}`, {
          key: `other:${section.id}:${block.title}`,
          kind: "other",
          name: block.title,
          icon: block.image,
          href: null,
          verdict: classify(block.groups),
          section: section.title,
          context: block.context,
          groups: block.groups,
          detected: [],
          current: null,
        });
      }
    }
  }

  // Cambios detectados en los datos: se suman a la tarjeta existente o crean una nueva.
  for (const e of diff.entries) {
    const key = `${e.kind}:${e.id}`;
    const existing = entries.get(key);
    if (existing) {
      existing.detected = e.diffs;
      continue;
    }
    entries.set(key, {
      key,
      kind: e.kind,
      name: e.name,
      icon: e.kind === "champion" ? img.champion(version, e.id) : img.item(e.status === "removed" ? diff.from : version, e.id),
      href: e.kind === "champion" ? `/campeones/${e.id}?vista=counters` : null,
      verdict: e.status === "new" ? "new" : e.status === "removed" ? "nerf" : classify([], e.diffs),
      section: null,
      context: e.status === "removed" ? "Retirado de la tienda." : e.status === "new" ? (e.kind === "item" ? "Objeto nuevo o que vuelve a la tienda." : "Campeón nuevo.") : null,
      groups: [],
      detected: e.diffs,
      current: null,
    });
  }

  for (const entry of entries.values()) {
    if (entry.kind !== "champion") continue;
    const id = entry.key.slice("champion:".length);
    const row = bestRow.get(id);
    if (row) entry.current = { tier: row.tier, winRate: row.winRate, role: row.role };
  }

  const order: Record<ChangeKind, number> = { champion: 0, item: 1, other: 2 };
  const changes = [...entries.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "es"));

  return {
    patch,
    note: latest && note ? { slug: latest.slug, title: note.title || latest.title, url: note.url, date: latest.date, banner: latest.image ?? note.banner } : null,
    changes,
    others: list.filter((n) => n.slug !== latest?.slug),
  };
}
