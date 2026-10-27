import type { Item, RuneTree, SummonerSpell } from "@/lib/ddragon";
import { pct, wrClass } from "@/lib/format";
import type { Stat } from "@/lib/stats";
import { ItemIcon, RuneIcon, SpellIcon } from "./icons";

export const SHARDS: Record<string, { name: string; icon: string }> = {
  "5008": {
    name: "Fuerza adaptable",
    icon: "perk-images/StatMods/StatModsAdaptiveForceIcon.png",
  },
  "5005": {
    name: "Velocidad de ataque",
    icon: "perk-images/StatMods/StatModsAttackSpeedIcon.png",
  },
  "5007": {
    name: "Velocidad de habilidades",
    icon: "perk-images/StatMods/StatModsCDRScalingIcon.png",
  },
  "5010": {
    name: "Velocidad de movimiento",
    icon: "perk-images/StatMods/StatModsMovementSpeedIcon.png",
  },
  "5001": {
    name: "Vida escalable",
    icon: "perk-images/StatMods/StatModsHealthScalingIcon.png",
  },
  "5011": {
    name: "Vida",
    icon: "perk-images/StatMods/StatModsHealthPlusIcon.png",
  },
  "5013": {
    name: "Tenacidad y resistencia a ralentizaciones",
    icon: "perk-images/StatMods/StatModsTenacityIcon.png",
  },
};

const SHARD_ROWS = [
  ["5008", "5005", "5007"],
  ["5008", "5010", "5001"],
  ["5011", "5013", "5001"],
];

export function parseRunePage(key: string) {
  const [primary, secondary, shards] = key.split("|");
  const [pTree, pRunes] = primary.split(":");
  const [sTree, sRunes] = secondary.split(":");
  return {
    primaryTree: Number(pTree),
    primary: pRunes.split(",").map(Number),
    secondaryTree: Number(sTree),
    secondary: sRunes.split(",").map(Number),
    shards: shards.split(","),
  };
}

/** Página de runas completa, con las elegidas resaltadas (como en el cliente). */
export function RunePage({ runeKey, trees }: { runeKey: string; trees: RuneTree[] }) {
  const page = parseRunePage(runeKey);
  const primary = trees.find((t) => t.id === page.primaryTree);
  const secondary = trees.find((t) => t.id === page.secondaryTree);
  if (!primary || !secondary) return null;
  const chosen = new Set([...page.primary, ...page.secondary]);

  return (
    // Se adapta al ancho de la tarjeta (no de la pantalla): en la columna de En vivo no entraban las tres columnas.
    <div className="@container">
      {/* Una columna en tarjetas angostas (celular): las cuatro runas clave no entraban en media tarjeta. */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 @sm:grid-cols-2 @2xl:grid-cols-[1fr_1fr_auto] @2xl:gap-6">
        <div>
          <p className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <RuneIcon icon={primary.icon} size={22} />
            {primary.name}
          </p>
          <div className="space-y-3">
            {primary.slots.map((slot, i) => (
              <div key={i} className="flex justify-around gap-2">
                {slot.runes.map((r) => (
                  <RuneIcon key={r.id} icon={r.icon} name={r.name} size={i === 0 ? 38 : 30} dim={!chosen.has(r.id)} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <RuneIcon icon={secondary.icon} size={22} />
            {secondary.name}
          </p>
          <div className="space-y-3">
            {secondary.slots.slice(1).map((slot, i) => (
              <div key={i} className="flex justify-around gap-2">
                {slot.runes.map((r) => (
                  <RuneIcon key={r.id} icon={r.icon} name={r.name} size={30} dim={!chosen.has(r.id)} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="@sm:col-span-2 @2xl:col-span-1">
          <p className="mb-3 font-display text-lg font-semibold">Fragmentos</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 @2xl:block @2xl:space-y-2">
            {SHARD_ROWS.map((row, i) => (
              <div key={i} className="flex gap-2">
                {row.map((id, j) => (
                  <span key={j} className={`rounded-full p-1 ${page.shards[i] === id ? "bg-raised ring-1 ring-gold" : ""}`}>
                    <RuneIcon icon={SHARDS[id].icon} name={SHARDS[id].name} size={20} dim={page.shards[i] !== id} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatLine({ stat }: { stat: Stat }) {
  return (
    <div className="ml-auto flex shrink-0 gap-3 text-right text-sm sm:gap-4">
      <span className={`sm:w-14 ${wrClass(stat.winRate)}`}>{pct(stat.winRate)}</span>
      <span className="text-muted sm:w-20">{pct(stat.share)} uso</span>
    </div>
  );
}

export function ItemPath({ ids, version, items }: { ids: string[]; version: string; items: Record<string, Item> }) {
  return (
    <div className="flex items-center gap-1.5">
      {ids.map((id, i) => (
        <span key={`${id}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && (
            <svg viewBox="0 0 12 12" className="h-3 w-3 text-dim" aria-hidden="true">
              <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
          <ItemIcon version={version} id={id} name={items[id]?.name} size={36} />
        </span>
      ))}
    </div>
  );
}

export function SpellPair({ spellKey, spells, version }: { spellKey: string; spells: Record<string, SummonerSpell>; version: string }) {
  return (
    <div className="flex gap-1.5">
      {spellKey
        .split("-")
        .map((k) =>
          spells[k] ? <SpellIcon key={k} version={version} file={spells[k].image.full} name={spells[k].name} size={32} /> : null,
        )}
    </div>
  );
}

/** Orden de maximización: Q/W/E según en qué nivel llegan al rango 5 (o cuál tiene más puntos). */
export function skillPriority(sequence: string): string[] {
  return ["Q", "W", "E"]
    .map((k) => ({
      k,
      count: sequence.split("").filter((s) => s === k).length,
      last: sequence.lastIndexOf(k),
    }))
    .sort((a, b) => b.count - a.count || a.last - b.last)
    .map((x) => x.k);
}

/** Tabla de los primeros 15 niveles de habilidad. */
export function SkillOrder({
  sequence,
  abilityNames,
  compact = false,
}: {
  sequence: string;
  abilityNames: Record<string, string>;
  /** Sin el nombre de cada habilidad (columnas angostas): solo la tecla. */
  compact?: boolean;
}) {
  const keys = ["Q", "W", "E", "R"];
  const priority = skillPriority(sequence);

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-sm text-muted">
        Prioridad:
        {priority.map((k, i) => (
          <span key={k} className="flex items-center gap-2">
            {i > 0 && <span className="text-dim">&gt;</span>}
            <span className="rounded bg-raised px-2 py-0.5 font-display text-base font-bold text-gold-soft">{k}</span>
          </span>
        ))}
      </p>
      <div className="overflow-x-auto">
        <table className={`text-center ${compact ? "w-full table-fixed text-[10px]" : "text-xs"}`}>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <th className={`${compact ? "w-6 pr-1" : "pr-3"} text-left font-medium whitespace-nowrap text-muted`} title={abilityNames[k]}>
                  <span className="font-display text-sm text-ink">{k}</span>
                  <span className={`ml-2 hidden max-w-36 truncate align-middle ${compact ? "" : "md:inline-block"}`}>{abilityNames[k]}</span>
                </th>
                {sequence.split("").map((s, i) => (
                  <td key={i} className={compact ? "p-px" : "p-0.5"}>
                    <span
                      className={`flex ${compact ? "h-5 w-full" : "h-6 w-6"} items-center justify-center rounded ${
                        s === k ? (k === "R" ? "bg-gold text-night" : "bg-hex/80 text-night") : "bg-raised/60 text-transparent"
                      } font-semibold`}
                    >
                      {i + 1}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
