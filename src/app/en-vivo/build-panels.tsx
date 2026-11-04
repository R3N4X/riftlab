/**
 * Build de la selección de campeones: objetos y habilidades (bajo los
 * encuentros) y, en la columna derecha, los tres packs completos (runas,
 * objetos, hechizos y habilidades) para importar al cliente de una vez.
 */
import { ItemPath, SHARDS, SkillOrder, SpellPair, parseRunePage, skillPriority } from "@/components/build";
import { ItemIcon, RuneIcon, SpellIcon } from "@/components/icons";
import { AutoImportStatus, ImportBuildButton } from "@/components/live-client";
import type { ChampionDetail, ChampionSummary, Item, Rune, SummonerSpell } from "@/lib/ddragon";
import { pct } from "@/lib/format";
import type { BuildPayload } from "@/lib/live";
import { buildPacks, draftProfile, payloadFor, type Pack, type Stats } from "./build-payload";
import { PackTabs } from "./pack-tabs";

export function ItemsAndSkills({
  stats,
  detail,
  items,
  version,
}: {
  stats: Stats;
  detail: ChampionDetail | null;
  items: Record<string, Item>;
  version: string;
}) {
  const abilityNames = Object.fromEntries(["Q", "W", "E", "R"].map((k, i) => [k, detail?.spells[i]?.name ?? k]));
  // Los objetos principales ya están en la build completa de cada Top: aquí solo va cómo empezar.
  const starter = stats.starters[0];
  if (!starter && !stats.skills[0]) return null;
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3" aria-labelledby="objetos">
      <h2 id="objetos" className="sr-only">
        Inicio y habilidades
      </h2>
      {starter && (
        <div>
          <h3 className="mb-2 text-xs text-muted">Compra inicial</h3>
          <ItemPath ids={starter.key.split("-")} version={version} items={items} />
        </div>
      )}
      {stats.skills[0] && (
        <div className={starter ? "border-t border-line/60 pt-3" : ""}>
          <SkillOrder sequence={stats.skills[0].key} abilityNames={abilityNames} compact />
        </div>
      )}
    </section>
  );
}

/* ---------- Packs Top 1 / 2 / 3 ---------- */

export function BuildPacks({
  me,
  stats,
  enemies,
  detail,
  items,
  runeIndex,
  spells,
  version,
}: {
  me: ChampionSummary;
  stats: Stats;
  /** Rivales ya elegidos: ajustan las botas. */
  enemies: ChampionSummary[];
  detail: ChampionDetail | null;
  items: Record<string, Item>;
  runeIndex: Record<number, Rune>;
  spells: Record<string, SummonerSpell>;
  version: string;
}) {
  const draft = draftProfile(enemies);
  const packs = buildPacks(stats, draft);
  if (!packs.length) return null;
  return (
    <section className="rounded-lg border border-line bg-surface p-3" aria-labelledby="packs">
      <h2 id="packs" className="text-center font-display text-lg font-semibold">
        Builds
      </h2>
      <p className="mt-1 mb-3 text-center text-xs text-muted">Las más jugadas con este campeón en este rol (victorias y uso).</p>
      <AutoImportStatus championKey={me.key} />
      {packs.length < 3 && (
        <p className="mb-3 text-xs text-dim">
          Solo {packs.length === 1 ? "una build tiene" : `${packs.length} builds tienen`} partidas suficientes con este campeón en este rol.
        </p>
      )}
      <PackTabs
        tabs={packs.map((pack, i) => {
          const reference = pack.core ?? pack.rune;
          return {
            label: `Top ${i + 1}`,
            hint: reference ? `${pct(reference.winRate)} · ${pct(reference.share)} uso` : "",
            panel: (
              <PackCard
                pack={pack}
                build={payloadFor(me, pack, stats, draft, items)}
                detail={detail}
                items={items}
                runeIndex={runeIndex}
                spells={spells}
                version={version}
              />
            ),
          };
        })}
      />
    </section>
  );
}

function PackCard({
  pack,
  build,
  detail,
  items,
  runeIndex,
  spells,
  version,
}: {
  pack: Pack;
  build: BuildPayload;
  detail: ChampionDetail | null;
  items: Record<string, Item>;
  runeIndex: Record<number, Rune>;
  spells: Record<string, SummonerSpell>;
  version: string;
}) {
  const block = (prefix: string) => build.blocks.find((b) => b.title.startsWith(prefix));
  const keyItems = block("Build completa")?.items ?? [];
  const vsDraft = block("Según la partida");
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-line bg-night/40 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Build completa</h4>
          {pack.bootsReason && <p className="-mt-1 mb-1.5 text-[11px] text-gold-soft">Botas: {pack.bootsReason.toLowerCase()}</p>}
          <div className="grid w-fit grid-cols-3 gap-1.5">
            {keyItems.map((id, j) => (
              <ItemIcon key={`${id}-${j}`} version={version} id={id} name={items[id]?.name} size={36} />
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Runas</h4>
          {pack.rune ? <CompactRunes runeKey={pack.rune.key} runeIndex={runeIndex} /> : <p className="text-xs text-dim">Sin datos</p>}
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Hechizos</h4>
          {pack.spell ? (
            <SpellPair spellKey={pack.spell.key} spells={spells} version={version} />
          ) : (
            <p className="text-xs text-dim">Sin datos</p>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Habilidades</h4>
          {pack.skill ? (
            <SkillIcons sequence={pack.skill.key} detail={detail} version={version} />
          ) : (
            <p className="text-xs text-dim">Sin datos</p>
          )}
        </div>
      </div>
      {vsDraft && (
        <div className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/5 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-tight text-gold-soft">{vsDraft.title}</p>
          {vsDraft.items.map((id) => (
            <ItemIcon key={id} version={version} id={id} name={items[id]?.name} size={28} />
          ))}
        </div>
      )}
      <div className="mt-auto">
        <ImportBuildButton build={build} />
      </div>
    </article>
  );
}

/** Piedra angular grande, el resto de las runas y los fragmentos en chico. */
function CompactRunes({ runeKey, runeIndex }: { runeKey: string; runeIndex: Record<number, Rune> }) {
  const page = parseRunePage(runeKey);
  const [keystone, ...rest] = page.primary.map((id) => runeIndex[id]).filter(Boolean);
  const secondary = page.secondary.map((id) => runeIndex[id]).filter(Boolean);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {keystone && (
          <span className="rounded-full ring-2 ring-gold">
            <RuneIcon icon={keystone.icon} name={keystone.name} size={34} />
          </span>
        )}
        {rest.map((r) => (
          <RuneIcon key={r.id} icon={r.icon} name={r.name} size={26} />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {secondary.map((r) => (
          <RuneIcon key={r.id} icon={r.icon} name={r.name} size={24} />
        ))}
        {page.shards.map((id, j) =>
          SHARDS[id] ? <RuneIcon key={`${id}-${j}`} icon={SHARDS[id].icon} name={SHARDS[id].name} size={16} /> : null,
        )}
      </div>
    </div>
  );
}

/** Orden de maximización con el ícono de cada habilidad: W > E > Q. */
function SkillIcons({ sequence, detail, version }: { sequence: string; detail: ChampionDetail | null; version: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {skillPriority(sequence).map((k, i) => {
        const spell = detail?.spells["QWE".indexOf(k)];
        return (
          <span key={k} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-dim">&gt;</span>}
            <span className="relative">
              {spell ? <SpellIcon version={version} file={spell.image.full} name={spell.name} size={32} /> : null}
              <span className="absolute -right-1 -bottom-1 rounded bg-night px-1 font-display text-xs font-bold text-gold-soft">{k}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
